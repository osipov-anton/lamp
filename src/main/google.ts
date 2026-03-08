import { google, type gmail_v1, type calendar_v3 } from 'googleapis'
import { OAuth2Client } from 'google-auth-library'
import { createServer, type Server } from 'http'
import { shell } from 'electron'
import { getSettings, saveSettings } from './store'

declare const __GOOGLE_CLIENT_ID__: string
declare const __GOOGLE_CLIENT_SECRET__: string

const GOOGLE_CLIENT_ID = __GOOGLE_CLIENT_ID__
const GOOGLE_CLIENT_SECRET = __GOOGLE_CLIENT_SECRET__

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile'
]

export type GoogleConnectionStatus = 'disconnected' | 'connecting' | 'connected'

export interface GoogleUserInfo {
  email: string
  name: string
  picture?: string
}

function stripMimeHeaderLineBreaks(value: string): string {
  return value.replace(/[\r\n]+/g, '')
}

export class GoogleService {
  private oauth2Client: OAuth2Client
  private callbackServer: Server | null = null
  private statusListeners = new Set<(status: GoogleConnectionStatus) => void>()
  private _status: GoogleConnectionStatus = 'disconnected'
  private _userInfo: GoogleUserInfo | null = null

  constructor() {
    this.oauth2Client = new OAuth2Client(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      'http://127.0.0.1:0/oauth2callback'
    )
  }

  get status(): GoogleConnectionStatus {
    return this._status
  }

  get userInfo(): GoogleUserInfo | null {
    return this._userInfo
  }

  onStatusChange(listener: (status: GoogleConnectionStatus) => void): () => void {
    this.statusListeners.add(listener)
    return () => this.statusListeners.delete(listener)
  }

  private setStatus(status: GoogleConnectionStatus): void {
    this._status = status
    for (const listener of this.statusListeners) {
      try {
        listener(status)
      } catch {}
    }
  }

  isConnected(): boolean {
    return this._status === 'connected'
  }

  // ---------------------------------------------------------------------------
  // OAuth 2.0 flow
  // ---------------------------------------------------------------------------

  async startAuth(): Promise<void> {
    this.cleanupServer()
    this.setStatus('connecting')

    await new Promise<void>((resolve, reject) => {
      this.callbackServer = createServer(async (req, res) => {
        try {
          const url = new URL(req.url ?? '', `http://127.0.0.1`)
          const code = url.searchParams.get('code')
          const error = url.searchParams.get('error')

          if (error) {
            res.writeHead(200, { 'Content-Type': 'text/html' })
            res.end('<html><body><h2>Authorization denied.</h2><p>You can close this tab.</p></body></html>')
            this.cleanupServer()
            this.setStatus('disconnected')
            return
          }

          if (!code) {
            res.writeHead(400, { 'Content-Type': 'text/html' })
            res.end('<html><body><h2>Missing authorization code.</h2></body></html>')
            return
          }

          const { tokens } = await this.oauth2Client.getToken(code)
          this.oauth2Client.setCredentials(tokens)
          this.persistTokens(tokens)

          await this.fetchUserInfo()

          res.writeHead(200, { 'Content-Type': 'text/html' })
          res.end(
            '<html><body style="font-family:system-ui;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#1a1a1a;color:#fff">' +
            '<div style="text-align:center"><h2>Connected to Lamp AI</h2><p style="color:#888">You can close this tab.</p></div></body></html>'
          )

          this.cleanupServer()
          this.setStatus('connected')
        } catch (err) {
          console.error('[google] OAuth callback error:', err)
          res.writeHead(500, { 'Content-Type': 'text/html' })
          res.end('<html><body><h2>Authentication failed.</h2></body></html>')
          this.cleanupServer()
          this.setStatus('disconnected')
        }
      })

      this.callbackServer.listen(0, '127.0.0.1', () => {
        const address = this.callbackServer!.address()
        if (!address || typeof address === 'string') {
          this.setStatus('disconnected')
          reject(new Error('Failed to start local callback server'))
          return
        }

        const redirectUri = `http://127.0.0.1:${address.port}/oauth2callback`
        this.oauth2Client = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, redirectUri)

        const authUrl = this.oauth2Client.generateAuthUrl({
          access_type: 'offline',
          scope: SCOPES,
          prompt: 'consent'
        })

        shell.openExternal(authUrl)
        resolve()
      })

      this.callbackServer.on('error', (err) => {
        this.setStatus('disconnected')
        reject(err)
      })
    })
  }

  async disconnect(): Promise<void> {
    try {
      const token = this.oauth2Client.credentials.access_token
      if (token) {
        await this.oauth2Client.revokeToken(token)
      }
    } catch {
      // best-effort revocation
    }

    this.oauth2Client.setCredentials({})
    this._userInfo = null
    this.cleanupServer()
    this.setStatus('disconnected')
    saveSettings({
      googleRefreshToken: undefined,
      googleAccessToken: undefined,
      googleTokenExpiry: undefined
    })
  }

  async tryRestoreSession(): Promise<boolean> {
    const settings = getSettings()
    if (!settings.googleRefreshToken) return false

    try {
      this.setStatus('connecting')
      this.oauth2Client.setCredentials({
        refresh_token: settings.googleRefreshToken,
        access_token: settings.googleAccessToken || undefined,
        expiry_date: settings.googleTokenExpiry || undefined
      })

      await this.ensureValidToken()
      await this.fetchUserInfo()
      this.setStatus('connected')
      return true
    } catch (err) {
      console.error('[google] session restore failed:', err)
      this.setStatus('disconnected')
      return false
    }
  }

  // ---------------------------------------------------------------------------
  // Token management
  // ---------------------------------------------------------------------------

  private async ensureValidToken(): Promise<void> {
    const creds = this.oauth2Client.credentials
    const now = Date.now()
    const expiresAt = creds.expiry_date ?? 0

    if (!creds.access_token || now >= expiresAt - 60_000) {
      const { credentials } = await this.oauth2Client.refreshAccessToken()
      this.oauth2Client.setCredentials(credentials)
      this.persistTokens(credentials)
    }
  }

  private persistTokens(tokens: {
    refresh_token?: string | null
    access_token?: string | null
    expiry_date?: number | null
  }): void {
    const update: Record<string, unknown> = {}
    if (tokens.refresh_token) update.googleRefreshToken = tokens.refresh_token
    if (tokens.access_token) update.googleAccessToken = tokens.access_token
    if (tokens.expiry_date) update.googleTokenExpiry = tokens.expiry_date
    saveSettings(update as Parameters<typeof saveSettings>[0])
  }

  private async fetchUserInfo(): Promise<void> {
    const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client })
    const { data } = await oauth2.userinfo.get()
    this._userInfo = {
      email: data.email ?? '',
      name: data.name ?? '',
      picture: data.picture ?? undefined
    }
  }

  private cleanupServer(): void {
    if (this.callbackServer) {
      this.callbackServer.close()
      this.callbackServer = null
    }
  }

  // ---------------------------------------------------------------------------
  // Gmail API methods
  // ---------------------------------------------------------------------------

  private getGmail(): gmail_v1.Gmail {
    return google.gmail({ version: 'v1', auth: this.oauth2Client })
  }

  async listEmails(
    query?: string,
    maxResults = 20
  ): Promise<
    Array<{
      id: string
      threadId: string
      from: string
      subject: string
      snippet: string
      date: string
      isUnread: boolean
    }>
  > {
    await this.ensureValidToken()
    const gmail = this.getGmail()

    const { data } = await gmail.users.messages.list({
      userId: 'me',
      q: query || undefined,
      maxResults: Math.min(maxResults, 50)
    })

    if (!data.messages?.length) return []

    const results = await Promise.all(
      data.messages.map(async (msg) => {
        const { data: detail } = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id!,
          format: 'metadata',
          metadataHeaders: ['From', 'Subject', 'Date']
        })

        const headers = detail.payload?.headers ?? []
        const getHeader = (name: string) =>
          headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? ''

        return {
          id: detail.id ?? '',
          threadId: detail.threadId ?? '',
          from: getHeader('From'),
          subject: getHeader('Subject'),
          snippet: detail.snippet ?? '',
          date: getHeader('Date'),
          isUnread: detail.labelIds?.includes('UNREAD') ?? false
        }
      })
    )

    return results
  }

  async getEmail(messageId: string): Promise<{
    id: string
    threadId: string
    from: string
    to: string
    subject: string
    date: string
    body: string
    isUnread: boolean
  }> {
    await this.ensureValidToken()
    const gmail = this.getGmail()

    const { data } = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full'
    })

    const headers = data.payload?.headers ?? []
    const getHeader = (name: string) =>
      headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? ''

    let body = ''
    const payload = data.payload

    if (payload) {
      body = this.extractEmailBody(payload)
    }

    return {
      id: data.id ?? '',
      threadId: data.threadId ?? '',
      from: getHeader('From'),
      to: getHeader('To'),
      subject: getHeader('Subject'),
      date: getHeader('Date'),
      body,
      isUnread: data.labelIds?.includes('UNREAD') ?? false
    }
  }

  private extractEmailBody(payload: gmail_v1.Schema$MessagePart): string {
    if (payload.body?.data) {
      return Buffer.from(payload.body.data, 'base64url').toString('utf-8')
    }

    if (payload.parts) {
      const textPart = payload.parts.find((p) => p.mimeType === 'text/plain')
      if (textPart?.body?.data) {
        return Buffer.from(textPart.body.data, 'base64url').toString('utf-8')
      }

      const htmlPart = payload.parts.find((p) => p.mimeType === 'text/html')
      if (htmlPart?.body?.data) {
        const html = Buffer.from(htmlPart.body.data, 'base64url').toString('utf-8')
        return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
      }

      for (const part of payload.parts) {
        if (part.parts) {
          const nested = this.extractEmailBody(part)
          if (nested) return nested
        }
      }
    }

    return ''
  }

  async sendEmail(
    to: string,
    subject: string,
    body: string
  ): Promise<{ messageId: string }> {
    await this.ensureValidToken()
    const gmail = this.getGmail()
    const safeTo = stripMimeHeaderLineBreaks(to)
    const safeSubject = stripMimeHeaderLineBreaks(subject)

    const rawMessage = [
      `To: ${safeTo}`,
      `Subject: ${safeSubject}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      body
    ].join('\r\n')

    const encoded = Buffer.from(rawMessage)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    const { data } = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encoded }
    })

    return { messageId: data.id ?? '' }
  }

  // ---------------------------------------------------------------------------
  // Calendar API methods
  // ---------------------------------------------------------------------------

  private getCalendar(): calendar_v3.Calendar {
    return google.calendar({ version: 'v3', auth: this.oauth2Client })
  }

  async listEvents(
    calendarId = 'primary',
    timeMin?: string,
    timeMax?: string,
    maxResults = 20
  ): Promise<
    Array<{
      id: string
      summary: string
      description?: string
      location?: string
      start: string
      end: string
      attendees: string[]
      htmlLink: string
    }>
  > {
    await this.ensureValidToken()
    const calendar = this.getCalendar()

    const now = new Date()
    const defaultMin = timeMin || now.toISOString()
    const defaultMax =
      timeMax || new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()

    const { data } = await calendar.events.list({
      calendarId,
      timeMin: defaultMin,
      timeMax: defaultMax,
      maxResults: Math.min(maxResults, 50),
      singleEvents: true,
      orderBy: 'startTime'
    })

    return (data.items ?? []).map((event) => ({
      id: event.id ?? '',
      summary: event.summary ?? '(No title)',
      description: event.description ?? undefined,
      location: event.location ?? undefined,
      start: event.start?.dateTime ?? event.start?.date ?? '',
      end: event.end?.dateTime ?? event.end?.date ?? '',
      attendees: (event.attendees ?? []).map(
        (a) => a.displayName ?? a.email ?? ''
      ),
      htmlLink: event.htmlLink ?? ''
    }))
  }

  async createEvent(
    calendarId = 'primary',
    event: {
      summary: string
      description?: string
      location?: string
      start: string
      end: string
      attendees?: string[]
    }
  ): Promise<{ eventId: string; htmlLink: string }> {
    await this.ensureValidToken()
    const calendar = this.getCalendar()

    const startHasTime = event.start.includes('T')
    const endHasTime = event.end.includes('T')

    const { data } = await calendar.events.insert({
      calendarId,
      requestBody: {
        summary: event.summary,
        description: event.description,
        location: event.location,
        start: startHasTime
          ? { dateTime: event.start }
          : { date: event.start },
        end: endHasTime ? { dateTime: event.end } : { date: event.end },
        attendees: event.attendees?.map((email) => ({ email }))
      }
    })

    return {
      eventId: data.id ?? '',
      htmlLink: data.htmlLink ?? ''
    }
  }

  async getEvent(
    calendarId = 'primary',
    eventId: string
  ): Promise<{
    id: string
    summary: string
    description?: string
    location?: string
    start: string
    end: string
    attendees: string[]
    htmlLink: string
    status: string
    organizer: string
  }> {
    await this.ensureValidToken()
    const calendar = this.getCalendar()

    const { data } = await calendar.events.get({
      calendarId,
      eventId
    })

    return {
      id: data.id ?? '',
      summary: data.summary ?? '(No title)',
      description: data.description ?? undefined,
      location: data.location ?? undefined,
      start: data.start?.dateTime ?? data.start?.date ?? '',
      end: data.end?.dateTime ?? data.end?.date ?? '',
      attendees: (data.attendees ?? []).map(
        (a) => a.displayName ?? a.email ?? ''
      ),
      htmlLink: data.htmlLink ?? '',
      status: data.status ?? '',
      organizer: data.organizer?.displayName ?? data.organizer?.email ?? ''
    }
  }
}

let googleService: GoogleService | null = null

export function getGoogleService(): GoogleService {
  if (!googleService) {
    googleService = new GoogleService()
  }
  return googleService
}
