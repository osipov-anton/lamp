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
  ): Promise<
    Array<{
      id: number
      sender: string
      text: string
      date: number
    }>
  > {
    if (!this.client) throw new Error('Not connected')
    const peer = await this.resolvePeer(chatName)
    const messages = await this.client.getMessages(peer, { limit })
    return messages.map((m) => ({
      id: m.id,
      sender: this.extractSenderName(m),
      text: m.message ?? '',
      date: (m.date ?? 0) * 1000
    }))
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
    }>
  > {
    if (!this.client) throw new Error('Not connected')

    if (chatName) {
      const peer = await this.resolvePeer(chatName)
      const messages = await this.client.getMessages(peer, { search: query, limit })
      return messages.map((m) => ({
        chatTitle: chatName,
        sender: this.extractSenderName(m),
        text: m.message ?? '',
        date: (m.date ?? 0) * 1000
      }))
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
    return messages.map((m) => ({
      chatTitle: '',
      sender: 'fromId' in m && m.fromId ? String(m.fromId) : 'unknown',
      text: 'message' in m ? (m.message ?? '') : '',
      date: ('date' in m ? (m.date ?? 0) : 0) * 1000
    }))
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
}

let telegramService: TelegramService | null = null

export function getTelegramService(): TelegramService {
  if (!telegramService) {
    telegramService = new TelegramService()
  }
  return telegramService
}
