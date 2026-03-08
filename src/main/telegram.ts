import { app } from 'electron'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { join, extname } from 'path'
import { TelegramClient, Api } from 'telegram'
import { StringSession } from 'telegram/sessions'
import { computeCheck } from 'telegram/Password'
import bigInt from 'big-integer'
import type { EntityLike } from 'telegram/define'
import { getSettings, saveSettings } from './store'

const TELEGRAM_API_ID = 26701780
const TELEGRAM_API_HASH = '478df2dea758bf2e41b2576696e8fac5'

export type TelegramConnectionStatus = 'disconnected' | 'connecting' | 'connected'

interface CachedPeer {
  entity: EntityLike
  resolvedAt: number
}

export interface TelegramImageAttachment {
  filePath: string
  mimeType: string
}

export interface TelegramMessageRecord {
  id: number
  sender: string
  text: string
  date: number
  images?: TelegramImageAttachment[]
}

const PEER_CACHE_TTL_MS = 10 * 60_000

export class TelegramService {
  private client: TelegramClient | null = null
  private peerCache = new Map<string, CachedPeer>()
  private phoneCodeHash = ''
  private phone = ''
  private statusListeners = new Set<(status: TelegramConnectionStatus) => void>()
  private _status: TelegramConnectionStatus = 'disconnected'

  get status(): TelegramConnectionStatus {
    return this._status
  }

  onStatusChange(listener: (status: TelegramConnectionStatus) => void): () => void {
    this.statusListeners.add(listener)
    return () => this.statusListeners.delete(listener)
  }

  private setStatus(status: TelegramConnectionStatus): void {
    this._status = status
    for (const listener of this.statusListeners) {
      try {
        listener(status)
      } catch {}
    }
  }

  // ---------------------------------------------------------------------------
  // Connection & auth
  // ---------------------------------------------------------------------------

  async connect(session: string = ''): Promise<boolean> {
    this.setStatus('connecting')
    try {
      const stringSession = new StringSession(session)
      this.client = new TelegramClient(stringSession, TELEGRAM_API_ID, TELEGRAM_API_HASH, {
        connectionRetries: 5
      })
      await this.client.connect()

      const authorized = await this.client.checkAuthorization()
      this.setStatus(authorized ? 'connected' : 'disconnected')
      return authorized
    } catch (err) {
      console.error('[telegram] connect failed:', err)
      this.setStatus('disconnected')
      throw err
    }
  }

  async sendCode(phone: string): Promise<void> {
    if (!this.client) throw new Error('Not connected')
    this.phone = phone
    const result = await this.client.sendCode(
      { apiId: TELEGRAM_API_ID, apiHash: TELEGRAM_API_HASH },
      phone
    )
    this.phoneCodeHash = result.phoneCodeHash
  }

  async signIn(code: string): Promise<{ requires2FA: boolean }> {
    if (!this.client) throw new Error('Not connected')
    try {
      await this.client.invoke(
        new Api.auth.SignIn({
          phoneNumber: this.phone,
          phoneCodeHash: this.phoneCodeHash,
          phoneCode: code
        })
      )
      this.setStatus('connected')
      this.persistSession()
      return { requires2FA: false }
    } catch (err: unknown) {
      const rpcError = err as { errorMessage?: string }
      if (rpcError.errorMessage === 'SESSION_PASSWORD_NEEDED') {
        return { requires2FA: true }
      }
      throw err
    }
  }

  async submit2FA(password: string): Promise<void> {
    if (!this.client) throw new Error('Not connected')
    const srpParams = await this.client.invoke(new Api.account.GetPassword())
    const srpCheck = await computeCheck(srpParams, password)
    await this.client.invoke(new Api.auth.CheckPassword({ password: srpCheck }))
    this.setStatus('connected')
    this.persistSession()
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.disconnect()
      this.client = null
    }
    this.peerCache.clear()
    this.setStatus('disconnected')
    const settings = getSettings()
    saveSettings({ ...settings, telegramSession: undefined })
  }

  isConnected(): boolean {
    return this._status === 'connected'
  }

  getSessionString(): string {
    return (this.client?.session.save() as unknown as string) ?? ''
  }

  private persistSession(): void {
    const session = this.getSessionString()
    if (session) {
      const settings = getSettings()
      saveSettings({ ...settings, telegramSession: session })
    }
  }

  async tryRestoreSession(): Promise<boolean> {
    const settings = getSettings()
    if (!settings.telegramSession) return false
    try {
      return await this.connect(settings.telegramSession)
    } catch (err) {
      console.error('[telegram] session restore failed:', err)
      return false
    }
  }

  // ---------------------------------------------------------------------------
  // Peer resolution with cache
  // ---------------------------------------------------------------------------

  async resolvePeer(chatName: string): Promise<EntityLike> {
    const cacheKey = chatName.toLowerCase()
    const cached = this.peerCache.get(cacheKey)
    if (cached && Date.now() - cached.resolvedAt < PEER_CACHE_TTL_MS) {
      return cached.entity
    }

    if (!this.client) throw new Error('Not connected')

    if (chatName.startsWith('@')) {
      try {
        const entity = await this.client.getEntity(chatName)
        this.peerCache.set(cacheKey, { entity, resolvedAt: Date.now() })
        return entity
      } catch {}
    }

    const dialogs = await this.client.getDialogs({ limit: 100 })
    const nameNorm = chatName.toLowerCase()
    for (const dialog of dialogs) {
      const title = (dialog.title ?? '').toLowerCase()
      if (title === nameNorm || title.includes(nameNorm)) {
        if (dialog.entity) {
          this.peerCache.set(cacheKey, { entity: dialog.entity, resolvedAt: Date.now() })
          return dialog.entity
        }
      }
    }

    const entity = await this.client.getEntity(chatName)
    this.peerCache.set(cacheKey, { entity, resolvedAt: Date.now() })
    return entity
  }

  // ---------------------------------------------------------------------------
  // Telegram API methods (consumed by tools)
  // ---------------------------------------------------------------------------

  async listDialogs(limit = 20): Promise<
    Array<{
      id: string
      title: string
      unreadCount: number
      lastMessage?: string
      lastMessageDate?: number
    }>
  > {
    if (!this.client) throw new Error('Not connected')
    const dialogs = await this.client.getDialogs({ limit })
    return dialogs.map((d) => ({
      id: d.id?.toString() ?? '',
      title: d.title ?? '',
      unreadCount: d.unreadCount ?? 0,
      lastMessage: d.message?.message ?? undefined,
      lastMessageDate: d.message?.date ? d.message.date * 1000 : undefined
    }))
  }

  async getMessages(
    chatName: string,
    limit = 20
  ): Promise<TelegramMessageRecord[]> {
    if (!this.client) throw new Error('Not connected')
    const peer = await this.resolvePeer(chatName)
    const messages = await this.client.getMessages(peer, { limit })
    return Promise.all(messages.map((message) => this.toMessageRecord(message)))
  }

  async sendMessage(chatName: string, text: string): Promise<{ messageId: number }> {
    if (!this.client) throw new Error('Not connected')
    const peer = await this.resolvePeer(chatName)
    const result = await this.client.sendMessage(peer, { message: text })
    return { messageId: result.id }
  }

  async listContacts(limit = 50): Promise<
    Array<{
      id: string
      displayName: string
      username?: string
      phone?: string
      isBot: boolean
    }>
  > {
    if (!this.client) throw new Error('Not connected')
    const response = await this.client.invoke(new Api.contacts.GetContacts({ hash: bigInt(0) }))
    const users = 'users' in response ? response.users : []

    return users
      .filter((user): user is Api.User => user instanceof Api.User)
      .slice(0, Math.max(1, Math.min(200, Math.floor(limit))))
      .map((user) => {
        const displayName =
          `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() ||
          user.username ||
          user.phone ||
          `user_${user.id}`

        return {
          id: String(user.id),
          displayName,
          username: user.username ?? undefined,
          phone: user.phone ?? undefined,
          isBot: Boolean(user.bot)
        }
      })
  }

  async searchMessages(
    query: string,
    chatName?: string,
    limit = 20
  ): Promise<
    Array<{
      chatTitle: string
      sender: string
      text: string
      date: number
      images?: TelegramImageAttachment[]
    }>
  > {
    if (!this.client) throw new Error('Not connected')

    if (chatName) {
      const peer = await this.resolvePeer(chatName)
      const messages = await this.client.getMessages(peer, { search: query, limit })
      return Promise.all(
        messages.map(async (message) => {
          const record = await this.toMessageRecord(message)
          return {
            chatTitle: chatName,
            sender: record.sender,
            text: record.text,
            date: record.date,
            images: record.images
          }
        })
      )
    }

    const result = await this.client.invoke(
      new Api.messages.SearchGlobal({
        q: query,
        filter: new Api.InputMessagesFilterEmpty(),
        minDate: 0,
        maxDate: 0,
        offsetRate: 0,
        offsetPeer: new Api.InputPeerEmpty(),
        offsetId: 0,
        limit
      })
    )

    const messages = 'messages' in result ? result.messages : []
    return Promise.all(
      messages.map(async (message) => {
        if (message instanceof Api.Message) {
          const record = await this.toMessageRecord(message)
          return {
            chatTitle: '',
            sender: record.sender,
            text: record.text,
            date: record.date,
            images: record.images
          }
        }

        return {
          chatTitle: '',
          sender: 'fromId' in message && message.fromId ? String(message.fromId) : 'unknown',
          text: 'message' in message ? (message.message ?? '') : '',
          date: ('date' in message ? (message.date ?? 0) : 0) * 1000
        }
      })
    )
  }

  private extractSenderName(msg: Api.Message): string {
    if (msg.sender) {
      if ('firstName' in msg.sender) {
        const first = (msg.sender as Api.User).firstName ?? ''
        const last = (msg.sender as Api.User).lastName ?? ''
        return `${first} ${last}`.trim() || 'Unknown'
      }
      if ('title' in msg.sender) {
        return (msg.sender as Api.Chat).title ?? 'Unknown'
      }
    }
    return 'Unknown'
  }

  private async toMessageRecord(message: Api.Message): Promise<TelegramMessageRecord> {
    return {
      id: message.id,
      sender: this.extractSenderName(message),
      text: message.message ?? '',
      date: (message.date ?? 0) * 1000,
      images: await this.extractImageAttachments(message)
    }
  }

  private async extractImageAttachments(message: Api.Message): Promise<TelegramImageAttachment[]> {
    if (!this.client || !message.media) return []

    if (message.media instanceof Api.MessageMediaPhoto) {
      const filePath = await this.downloadPhotoMedia(message)
      return filePath ? [{ filePath, mimeType: 'image/jpeg' }] : []
    }

    if (message.media instanceof Api.MessageMediaDocument) {
      const document = message.media.document
      if (!(document instanceof Api.Document)) return []
      const mimeType = document.mimeType || ''
      if (!mimeType.startsWith('image/')) return []
      const filePath = await this.downloadDocumentImage(message, document, mimeType)
      return filePath ? [{ filePath, mimeType }] : []
    }

    return []
  }

  private async downloadPhotoMedia(message: Api.Message): Promise<string | null> {
    const media = message.media
    if (!(media instanceof Api.MessageMediaPhoto)) return null

    const photoId =
      media.photo instanceof Api.Photo ? media.photo.id.toString() : `message-${message.id}`
    const filePath = await this.buildMediaPath(`photo-${photoId}`, '.jpg')
    if (await fileExists(filePath)) return filePath

    const payload = await this.client?.downloadMedia(message, {})
    const buffer = await toBuffer(payload)
    if (!buffer) return null
    await writeFile(filePath, buffer)
    return filePath
  }

  private async downloadDocumentImage(
    message: Api.Message,
    document: Api.Document,
    mimeType: string
  ): Promise<string | null> {
    const originalName = this.getDocumentFileName(document)
    const fallbackBase = `document-${document.id.toString()}`
    const extension = extname(originalName) || mimeTypeToExtension(mimeType) || '.img'
    const baseName = stripExtension(originalName) || fallbackBase
    const filePath = await this.buildMediaPath(baseName, extension)
    if (await fileExists(filePath)) return filePath

    const payload = await this.client?.downloadMedia(message, {})
    const buffer = await toBuffer(payload)
    if (!buffer) return null
    await writeFile(filePath, buffer)
    return filePath
  }

  private getDocumentFileName(document: Api.Document): string {
    for (const attribute of document.attributes) {
      if (attribute instanceof Api.DocumentAttributeFilename) {
        return attribute.fileName
      }
    }
    return ''
  }

  private async buildMediaPath(baseName: string, extension: string): Promise<string> {
    const dir = join(app.getPath('userData'), 'lamp-data', 'telegram-media')
    await mkdir(dir, { recursive: true })
    const safeBase = sanitizeFileName(baseName) || 'telegram-image'
    const safeExtension = extension.startsWith('.') ? extension : `.${extension}`
    return join(dir, `${safeBase}${safeExtension}`)
  }
}

let telegramService: TelegramService | null = null

export function getTelegramService(): TelegramService {
  if (!telegramService) {
    telegramService = new TelegramService()
  }
  return telegramService
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await readFile(filePath)
    return true
  } catch {
    return false
  }
}

async function toBuffer(value: string | Buffer | undefined): Promise<Buffer | null> {
  if (!value) return null
  if (Buffer.isBuffer(value)) return value
  try {
    return await readFile(value)
  } catch {
    return null
  }
}

function sanitizeFileName(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripExtension(value: string): string {
  const extension = extname(value)
  return extension ? value.slice(0, -extension.length) : value
}

function mimeTypeToExtension(mimeType: string): string | undefined {
  switch (mimeType.toLowerCase()) {
    case 'image/jpeg':
      return '.jpg'
    case 'image/png':
      return '.png'
    case 'image/gif':
      return '.gif'
    case 'image/webp':
      return '.webp'
    case 'image/bmp':
      return '.bmp'
    case 'image/heic':
      return '.heic'
    case 'image/heif':
      return '.heif'
    default:
      return undefined
  }
}
