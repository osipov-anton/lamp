import type {
  ToolDefinition,
  ToolInput,
  ToolExecutionContext,
  ToolProgressEvent,
  ToolResult
} from '../runtime/types'
import type { GoogleService } from '../../google'

export const GMAIL_LIST_EMAILS_ID = 'gmail_list_emails'
export const GMAIL_READ_EMAIL_ID = 'gmail_read_email'
export const GMAIL_SEND_EMAIL_ID = 'gmail_send_email'
export const GMAIL_SEARCH_EMAILS_ID = 'gmail_search_emails'
export const GCAL_LIST_EVENTS_ID = 'gcal_list_events'
export const GCAL_CREATE_EVENT_ID = 'gcal_create_event'
export const GCAL_GET_EVENT_ID = 'gcal_get_event'

export const ALL_GOOGLE_TOOL_IDS = [
  GMAIL_LIST_EMAILS_ID,
  GMAIL_READ_EMAIL_ID,
  GMAIL_SEND_EMAIL_ID,
  GMAIL_SEARCH_EMAILS_ID,
  GCAL_LIST_EVENTS_ID,
  GCAL_CREATE_EVENT_ID,
  GCAL_GET_EVENT_ID
]

function notConnectedResult(toolId: string): ToolResult {
  return {
    callId: '',
    toolId,
    success: false,
    content: [],
    error: 'Google is not connected. Ask the user to connect Google in Settings → Integrations.',
    durationMs: 0
  }
}

// ---------------------------------------------------------------------------
// gmail_list_emails
// ---------------------------------------------------------------------------

export function createGmailListEmailsTool(service: GoogleService): ToolDefinition {
  return {
    id: GMAIL_LIST_EMAILS_ID,
    version: '1.0.0',
    name: GMAIL_LIST_EMAILS_ID,
    description:
      "List the user's recent Gmail emails with sender, subject, snippet, and date.",
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of emails to return (default: 20, max: 50)'
        }
      }
    },

    async *execute(
      input: ToolInput,
      _context: ToolExecutionContext
    ): AsyncGenerator<ToolProgressEvent, ToolResult> {
      if (!service.isConnected()) return notConnectedResult(GMAIL_LIST_EMAILS_ID)

      const startTime = Date.now()
      const limit = Math.min(
        typeof input.arguments.limit === 'number' ? input.arguments.limit : 20,
        50
      )

      yield {
        callId: '',
        toolId: GMAIL_LIST_EMAILS_ID,
        status: 'started',
        statusText: 'Fetching emails...',
        phase: 'requesting',
        elapsedMs: 0
      }

      try {
        const emails = await service.listEmails(undefined, limit)
        const lines = emails.map((e, i) => {
          const unread = e.isUnread ? ' [UNREAD]' : ''
          return `${i + 1}. From: ${e.from}\n   Subject: ${e.subject}${unread}\n   Date: ${e.date}\n   Snippet: ${e.snippet}\n   ID: ${e.id}`
        })
        const text = lines.length > 0 ? lines.join('\n\n') : 'No emails found.'

        return {
          callId: '',
          toolId: GMAIL_LIST_EMAILS_ID,
          success: true,
          content: [{ type: 'text', text }],
          durationMs: Date.now() - startTime
        }
      } catch (err) {
        return {
          callId: '',
          toolId: GMAIL_LIST_EMAILS_ID,
          success: false,
          content: [],
          error: err instanceof Error ? err.message : 'Failed to list emails',
          durationMs: Date.now() - startTime
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// gmail_read_email
// ---------------------------------------------------------------------------

export function createGmailReadEmailTool(service: GoogleService): ToolDefinition {
  return {
    id: GMAIL_READ_EMAIL_ID,
    version: '1.0.0',
    name: GMAIL_READ_EMAIL_ID,
    description:
      'Read the full content of a specific Gmail email by its ID.',
    inputSchema: {
      type: 'object',
      properties: {
        message_id: {
          type: 'string',
          description: 'The Gmail message ID to read'
        }
      },
      required: ['message_id']
    },

    async *execute(
      input: ToolInput,
      _context: ToolExecutionContext
    ): AsyncGenerator<ToolProgressEvent, ToolResult> {
      if (!service.isConnected()) return notConnectedResult(GMAIL_READ_EMAIL_ID)

      const messageId = String(input.arguments.message_id ?? '').trim()
      if (!messageId) {
        return {
          callId: '',
          toolId: GMAIL_READ_EMAIL_ID,
          success: false,
          content: [],
          error: 'message_id is required',
          durationMs: 0
        }
      }

      const startTime = Date.now()

      yield {
        callId: '',
        toolId: GMAIL_READ_EMAIL_ID,
        status: 'started',
        statusText: 'Reading email...',
        phase: 'requesting',
        elapsedMs: 0
      }

      try {
        const email = await service.getEmail(messageId)
        const text = [
          `From: ${email.from}`,
          `To: ${email.to}`,
          `Subject: ${email.subject}`,
          `Date: ${email.date}`,
          email.isUnread ? 'Status: UNREAD' : 'Status: Read',
          '',
          email.body
        ].join('\n')

        return {
          callId: '',
          toolId: GMAIL_READ_EMAIL_ID,
          success: true,
          content: [{ type: 'text', text }],
          durationMs: Date.now() - startTime
        }
      } catch (err) {
        return {
          callId: '',
          toolId: GMAIL_READ_EMAIL_ID,
          success: false,
          content: [],
          error: err instanceof Error ? err.message : 'Failed to read email',
          durationMs: Date.now() - startTime
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// gmail_send_email
// ---------------------------------------------------------------------------

export function createGmailSendEmailTool(service: GoogleService): ToolDefinition {
  return {
    id: GMAIL_SEND_EMAIL_ID,
    version: '1.0.0',
    name: GMAIL_SEND_EMAIL_ID,
    description:
      'Send an email via Gmail. ALWAYS confirm with the user before calling this tool.',
    inputSchema: {
      type: 'object',
      properties: {
        to: {
          type: 'string',
          description: 'Recipient email address'
        },
        subject: {
          type: 'string',
          description: 'Email subject line'
        },
        body: {
          type: 'string',
          description: 'Email body text'
        }
      },
      required: ['to', 'subject', 'body']
    },

    async *execute(
      input: ToolInput,
      _context: ToolExecutionContext
    ): AsyncGenerator<ToolProgressEvent, ToolResult> {
      if (!service.isConnected()) return notConnectedResult(GMAIL_SEND_EMAIL_ID)

      const to = String(input.arguments.to ?? '').trim()
      const subject = String(input.arguments.subject ?? '').trim()
      const body = String(input.arguments.body ?? '').trim()

      if (!to || !subject || !body) {
        return {
          callId: '',
          toolId: GMAIL_SEND_EMAIL_ID,
          success: false,
          content: [],
          error: 'to, subject, and body are all required',
          durationMs: 0
        }
      }

      const startTime = Date.now()

      yield {
        callId: '',
        toolId: GMAIL_SEND_EMAIL_ID,
        status: 'started',
        statusText: `Sending email to ${to}...`,
        phase: 'sending',
        elapsedMs: 0
      }

      try {
        const result = await service.sendEmail(to, subject, body)
        return {
          callId: '',
          toolId: GMAIL_SEND_EMAIL_ID,
          success: true,
          content: [
            {
              type: 'text',
              text: `Email sent to ${to} (id: ${result.messageId})`
            }
          ],
          durationMs: Date.now() - startTime
        }
      } catch (err) {
        return {
          callId: '',
          toolId: GMAIL_SEND_EMAIL_ID,
          success: false,
          content: [],
          error: err instanceof Error ? err.message : 'Failed to send email',
          durationMs: Date.now() - startTime
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// gmail_search_emails
// ---------------------------------------------------------------------------

export function createGmailSearchEmailsTool(service: GoogleService): ToolDefinition {
  return {
    id: GMAIL_SEARCH_EMAILS_ID,
    version: '1.0.0',
    name: GMAIL_SEARCH_EMAILS_ID,
    description:
      'Search Gmail emails using Gmail search syntax (e.g. "from:john subject:meeting").',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Gmail search query (supports Gmail search operators like from:, to:, subject:, has:attachment, etc.)'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (default: 20, max: 50)'
        }
      },
      required: ['query']
    },

    async *execute(
      input: ToolInput,
      _context: ToolExecutionContext
    ): AsyncGenerator<ToolProgressEvent, ToolResult> {
      if (!service.isConnected()) return notConnectedResult(GMAIL_SEARCH_EMAILS_ID)

      const query = String(input.arguments.query ?? '').trim()
      if (!query) {
        return {
          callId: '',
          toolId: GMAIL_SEARCH_EMAILS_ID,
          success: false,
          content: [],
          error: 'query is required',
          durationMs: 0
        }
      }

      const limit = Math.min(
        typeof input.arguments.limit === 'number' ? input.arguments.limit : 20,
        50
      )
      const startTime = Date.now()

      yield {
        callId: '',
        toolId: GMAIL_SEARCH_EMAILS_ID,
        status: 'started',
        statusText: `Searching emails: "${query}"...`,
        phase: 'searching',
        elapsedMs: 0
      }

      try {
        const emails = await service.listEmails(query, limit)
        const lines = emails.map((e, i) => {
          const unread = e.isUnread ? ' [UNREAD]' : ''
          return `${i + 1}. From: ${e.from}\n   Subject: ${e.subject}${unread}\n   Date: ${e.date}\n   Snippet: ${e.snippet}\n   ID: ${e.id}`
        })
        const text =
          lines.length > 0
            ? `Found ${lines.length} result(s) for "${query}":\n\n${lines.join('\n\n')}`
            : `No emails found for "${query}".`

        return {
          callId: '',
          toolId: GMAIL_SEARCH_EMAILS_ID,
          success: true,
          content: [{ type: 'text', text }],
          durationMs: Date.now() - startTime
        }
      } catch (err) {
        return {
          callId: '',
          toolId: GMAIL_SEARCH_EMAILS_ID,
          success: false,
          content: [],
          error: err instanceof Error ? err.message : 'Search failed',
          durationMs: Date.now() - startTime
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// gcal_list_events
// ---------------------------------------------------------------------------

export function createGcalListEventsTool(service: GoogleService): ToolDefinition {
  return {
    id: GCAL_LIST_EVENTS_ID,
    version: '1.0.0',
    name: GCAL_LIST_EVENTS_ID,
    description:
      'List upcoming Google Calendar events. Defaults to the next 7 days on the primary calendar.',
    inputSchema: {
      type: 'object',
      properties: {
        days_ahead: {
          type: 'number',
          description: 'Number of days ahead to look (default: 7)'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of events (default: 20, max: 50)'
        },
        calendar_id: {
          type: 'string',
          description: 'Calendar ID (default: "primary")'
        }
      }
    },

    async *execute(
      input: ToolInput,
      _context: ToolExecutionContext
    ): AsyncGenerator<ToolProgressEvent, ToolResult> {
      if (!service.isConnected()) return notConnectedResult(GCAL_LIST_EVENTS_ID)

      const startTime = Date.now()
      const daysAhead =
        typeof input.arguments.days_ahead === 'number' ? input.arguments.days_ahead : 7
      const limit = Math.min(
        typeof input.arguments.limit === 'number' ? input.arguments.limit : 20,
        50
      )
      const calendarId =
        typeof input.arguments.calendar_id === 'string'
          ? input.arguments.calendar_id
          : 'primary'

      const now = new Date()
      const timeMax = new Date(
        now.getTime() + daysAhead * 24 * 60 * 60 * 1000
      ).toISOString()

      yield {
        callId: '',
        toolId: GCAL_LIST_EVENTS_ID,
        status: 'started',
        statusText: `Fetching calendar events (next ${daysAhead} days)...`,
        phase: 'requesting',
        elapsedMs: 0
      }

      try {
        const events = await service.listEvents(
          calendarId,
          now.toISOString(),
          timeMax,
          limit
        )
        const lines = events.map((e, i) => {
          const attendees =
            e.attendees.length > 0 ? `\n   Attendees: ${e.attendees.join(', ')}` : ''
          const location = e.location ? `\n   Location: ${e.location}` : ''
          return `${i + 1}. ${e.summary}\n   Start: ${e.start}\n   End: ${e.end}${location}${attendees}\n   ID: ${e.id}`
        })
        const text =
          lines.length > 0
            ? `Upcoming events (next ${daysAhead} days):\n\n${lines.join('\n\n')}`
            : `No events found in the next ${daysAhead} days.`

        return {
          callId: '',
          toolId: GCAL_LIST_EVENTS_ID,
          success: true,
          content: [{ type: 'text', text }],
          durationMs: Date.now() - startTime
        }
      } catch (err) {
        return {
          callId: '',
          toolId: GCAL_LIST_EVENTS_ID,
          success: false,
          content: [],
          error: err instanceof Error ? err.message : 'Failed to list events',
          durationMs: Date.now() - startTime
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// gcal_create_event
// ---------------------------------------------------------------------------

export function createGcalCreateEventTool(service: GoogleService): ToolDefinition {
  return {
    id: GCAL_CREATE_EVENT_ID,
    version: '1.0.0',
    name: GCAL_CREATE_EVENT_ID,
    description:
      'Create a new Google Calendar event. ALWAYS confirm details with the user before calling this tool.',
    inputSchema: {
      type: 'object',
      properties: {
        summary: {
          type: 'string',
          description: 'Event title'
        },
        start: {
          type: 'string',
          description: 'Start time in ISO 8601 format (e.g. "2025-03-15T10:00:00-05:00" for timed event, or "2025-03-15" for all-day)'
        },
        end: {
          type: 'string',
          description: 'End time in ISO 8601 format'
        },
        description: {
          type: 'string',
          description: 'Event description (optional)'
        },
        location: {
          type: 'string',
          description: 'Event location (optional)'
        },
        attendees: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of attendee email addresses (optional)'
        },
        calendar_id: {
          type: 'string',
          description: 'Calendar ID (default: "primary")'
        }
      },
      required: ['summary', 'start', 'end']
    },

    async *execute(
      input: ToolInput,
      _context: ToolExecutionContext
    ): AsyncGenerator<ToolProgressEvent, ToolResult> {
      if (!service.isConnected()) return notConnectedResult(GCAL_CREATE_EVENT_ID)

      const summary = String(input.arguments.summary ?? '').trim()
      const start = String(input.arguments.start ?? '').trim()
      const end = String(input.arguments.end ?? '').trim()

      if (!summary || !start || !end) {
        return {
          callId: '',
          toolId: GCAL_CREATE_EVENT_ID,
          success: false,
          content: [],
          error: 'summary, start, and end are required',
          durationMs: 0
        }
      }

      const calendarId =
        typeof input.arguments.calendar_id === 'string'
          ? input.arguments.calendar_id
          : 'primary'
      const startTime = Date.now()

      yield {
        callId: '',
        toolId: GCAL_CREATE_EVENT_ID,
        status: 'started',
        statusText: `Creating event "${summary}"...`,
        phase: 'sending',
        elapsedMs: 0
      }

      try {
        const result = await service.createEvent(calendarId, {
          summary,
          start,
          end,
          description:
            typeof input.arguments.description === 'string'
              ? input.arguments.description
              : undefined,
          location:
            typeof input.arguments.location === 'string'
              ? input.arguments.location
              : undefined,
          attendees: Array.isArray(input.arguments.attendees)
            ? input.arguments.attendees.map(String)
            : undefined
        })

        return {
          callId: '',
          toolId: GCAL_CREATE_EVENT_ID,
          success: true,
          content: [
            {
              type: 'text',
              text: `Event "${summary}" created (id: ${result.eventId})\nLink: ${result.htmlLink}`
            }
          ],
          durationMs: Date.now() - startTime
        }
      } catch (err) {
        return {
          callId: '',
          toolId: GCAL_CREATE_EVENT_ID,
          success: false,
          content: [],
          error: err instanceof Error ? err.message : 'Failed to create event',
          durationMs: Date.now() - startTime
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// gcal_get_event
// ---------------------------------------------------------------------------

export function createGcalGetEventTool(service: GoogleService): ToolDefinition {
  return {
    id: GCAL_GET_EVENT_ID,
    version: '1.0.0',
    name: GCAL_GET_EVENT_ID,
    description: 'Get details of a specific Google Calendar event by its ID.',
    inputSchema: {
      type: 'object',
      properties: {
        event_id: {
          type: 'string',
          description: 'The calendar event ID'
        },
        calendar_id: {
          type: 'string',
          description: 'Calendar ID (default: "primary")'
        }
      },
      required: ['event_id']
    },

    async *execute(
      input: ToolInput,
      _context: ToolExecutionContext
    ): AsyncGenerator<ToolProgressEvent, ToolResult> {
      if (!service.isConnected()) return notConnectedResult(GCAL_GET_EVENT_ID)

      const eventId = String(input.arguments.event_id ?? '').trim()
      if (!eventId) {
        return {
          callId: '',
          toolId: GCAL_GET_EVENT_ID,
          success: false,
          content: [],
          error: 'event_id is required',
          durationMs: 0
        }
      }

      const calendarId =
        typeof input.arguments.calendar_id === 'string'
          ? input.arguments.calendar_id
          : 'primary'
      const startTime = Date.now()

      yield {
        callId: '',
        toolId: GCAL_GET_EVENT_ID,
        status: 'started',
        statusText: 'Fetching event details...',
        phase: 'requesting',
        elapsedMs: 0
      }

      try {
        const event = await service.getEvent(calendarId, eventId)
        const attendees =
          event.attendees.length > 0
            ? `Attendees: ${event.attendees.join(', ')}`
            : 'Attendees: none'
        const location = event.location ? `Location: ${event.location}` : ''
        const description = event.description
          ? `Description: ${event.description}`
          : ''

        const text = [
          `Event: ${event.summary}`,
          `Status: ${event.status}`,
          `Organizer: ${event.organizer}`,
          `Start: ${event.start}`,
          `End: ${event.end}`,
          location,
          attendees,
          description,
          `Link: ${event.htmlLink}`
        ]
          .filter(Boolean)
          .join('\n')

        return {
          callId: '',
          toolId: GCAL_GET_EVENT_ID,
          success: true,
          content: [{ type: 'text', text }],
          durationMs: Date.now() - startTime
        }
      } catch (err) {
        return {
          callId: '',
          toolId: GCAL_GET_EVENT_ID,
          success: false,
          content: [],
          error: err instanceof Error ? err.message : 'Failed to get event',
          durationMs: Date.now() - startTime
        }
      }
    }
  }
}
