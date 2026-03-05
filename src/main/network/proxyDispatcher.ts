import { ProxyAgent } from 'undici'

const proxyAgents = new Map<string, ProxyAgent>()

function normalizeProxyUrl(proxyUrl: string | undefined): string | null {
  const raw = proxyUrl?.trim()
  if (!raw) return null
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(raw)) {
    return raw
  }
  return `http://${raw}`
}

function getProxyAgent(proxyUrl: string | undefined): ProxyAgent | null {
  const normalized = normalizeProxyUrl(proxyUrl)
  if (!normalized) return null
  let agent = proxyAgents.get(normalized)
  if (!agent) {
    agent = new ProxyAgent(normalized)
    proxyAgents.set(normalized, agent)
  }
  return agent
}

export function withProxyRequestInit(
  init: RequestInit,
  proxyUrl: string | undefined
): RequestInit {
  const proxyAgent = getProxyAgent(proxyUrl)
  if (!proxyAgent) return init
  return { ...init, dispatcher: proxyAgent } as RequestInit
}
