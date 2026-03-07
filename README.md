<p align="center">
  <img src="resources/icon.png" width="128" height="128" alt="Lamp AI" />
</p>

<h1 align="center">Lamp AI</h1>

<p align="center">
  <strong>Your personal AI assistant that remembers everything.</strong>
</p>

<p align="center">
  Desktop-first &bull; Local storage &bull; Persistent memory &bull; Telegram integration
</p>

<p align="center">
  <a href="https://github.com/osipov-anton/lamp/releases">Download</a>
</p>

---

## What is Lamp?

Lamp is a native desktop AI assistant built on Electron. Unlike browser-based chatbots, Lamp runs locally, stores your data on your machine, and builds a persistent memory graph of facts and entities across all your conversations.

Think of it as a personal AI that actually *knows* you — the more you use it, the smarter it gets.

## Core Ideas

**Memory that persists.** Lamp extracts facts from your conversations and maintains an entity graph. When you mention something weeks later, it already has context. No copy-pasting, no "as I mentioned before."

**Threads, not just chats.** Fork any message into a side thread to explore a tangent without losing the main conversation. Quote a specific part to branch from exactly the right point.

**Integrations that talk.** Connect Telegram and let Lamp read, search, and send messages on your behalf. Gmail, Calendar, and Apple Health are on the roadmap.

**Your data, your machine.** Everything lives in a local JSON store. No cloud sync, no telemetry, no surprises.

## Features

| | |
|---|---|
| **Streaming chat** | Real-time token streaming with thinking indicators |
| **Threaded conversations** | Main thread + side threads with quote-based branching |
| **Persistent memory** | Fact extraction, entity graph, relevance scoring |
| **Web search** | Perplexity Sonar Pro via OpenRouter |
| **File attachments** | Images, PDFs, code files — drag and drop |
| **Telegram** | List chats, read/send/search messages via MTProto |
| **Command palette** | `⌘K` to navigate, search chats, quick actions |
| **Auto-updates** | Seamless updates via GitHub Releases |
| **Proxy support** | Optional HTTP proxy for restricted networks |

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Electron Shell                    │
├──────────────────────┬──────────────────────────────┤
│    Main Process      │       Renderer (React)       │
│                      │                              │
│  ┌────────────────┐  │  ┌────────────────────────┐  │
│  │ Agent Runtime   │  │  │ Chat UI                │  │
│  │  ├─ Supervisor  │  │  │  ├─ Sidebar            │  │
│  │  ├─ Tools       │◄─┼──┤  ├─ Threads            │  │
│  │  └─ Memory      │  │  │  ├─ Command Palette    │  │
│  ├────────────────┤  │  │  └─ Settings            │  │
│  │ Storage Layer   │  │  └────────────────────────┘  │
│  │  ├─ Orama (vec) │  │                              │
│  │  └─ JSON Store  │  │                              │
│  ├────────────────┤  │                              │
│  │ Integrations    │  │                              │
│  │  ├─ Telegram    │  │                              │
│  │  └─ OpenRouter  │  │                              │
│  └────────────────┘  │                              │
└──────────────────────┴──────────────────────────────┘
```

### Multi-Agent System

Lamp runs a **Supervisor Router** that orchestrates multiple agents:

- **Main Assistant** — handles user queries, uses tools, streams responses
- **Memory Curator** — extracts facts, merges entities, archives stale knowledge

Each agent has a scoped tool policy. The main assistant can invoke the memory curator, but not vice versa. Tool calls are executed as async generators with progress events piped to the UI in real time.

### Agent Tools

| Tool | Description |
|------|-------------|
| `web_search` | Search the web via Perplexity Sonar Pro |
| `search_messages` | Semantic search across chat history |
| `memory_query` | Query the fact/entity graph |
| `memory_upsert_fact` | Create or update a fact |
| `memory_merge_entities` | Deduplicate entities |
| `memory_archive_facts` | Archive outdated facts |
| `memory_link_identity` | Link identities across channels |
| `telegram_*` | Full Telegram integration (5 tools) |
| `invoke_agent` | Call another agent from within a run |

## Tech Stack

| Layer | Tech |
|-------|------|
| Shell | Electron 33 |
| Build | electron-vite, electron-builder |
| UI | React 18, TypeScript |
| Styling | Tailwind CSS 4, Radix UI |
| Icons | Lucide, Hugeicons |
| LLM | OpenRouter (chat, embeddings, vision) |
| Search | Orama (vector + full-text) |
| Telegram | MTProto via `telegram` package |
| Markdown | Streamdown |
| Updates | electron-updater |

## Getting Started

### Prerequisites

- Node.js 22+
- OpenRouter API key ([get one here](https://openrouter.ai/keys))

### Development

```bash
npm install
npm run dev
```

### Build

```bash
# macOS
npm run dist:mac

# Windows
npm run dist:win
```

Built artifacts land in the `dist/` folder — DMG + ZIP for macOS, NSIS installer for Windows.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘ N` | New chat |
| `⌘ K` | Command palette |
| `⌘ ,` | Settings |
| `⌘ I` | Integrations |
| `⌘ ⌫` | Delete current chat |
| `⌘ .` | Stop streaming |

## Roadmap

- [ ] Gmail integration
- [ ] Google Calendar integration
- [ ] Apple Health integration
- [ ] More LLM providers (direct OpenAI, Anthropic)
- [ ] Knowledge base with document ingestion
- [ ] Voice input

## License

Private. All rights reserved.
