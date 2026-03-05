export interface RateLimit {
  maxCallsPerRun?: number
  maxCallsPerMinute?: number
}

export interface AgentToolPolicy {
  agentId: string
  allowedToolIds: string[]
  rateLimits?: Record<string, RateLimit>
}

export function isToolAllowed(policy: AgentToolPolicy, toolId: string): boolean {
  return policy.allowedToolIds.includes(toolId)
}

export function checkRateLimit(
  policy: AgentToolPolicy,
  toolId: string,
  callCountInRun: number,
  callCountLastMinute: number
): { allowed: boolean; reason?: string } {
  const limits = policy.rateLimits?.[toolId]
  if (!limits) return { allowed: true }

  if (limits.maxCallsPerRun !== undefined && callCountInRun >= limits.maxCallsPerRun) {
    return { allowed: false, reason: `Tool "${toolId}" exceeded max calls per run (${limits.maxCallsPerRun})` }
  }

  if (limits.maxCallsPerMinute !== undefined && callCountLastMinute >= limits.maxCallsPerMinute) {
    return { allowed: false, reason: `Tool "${toolId}" exceeded rate limit (${limits.maxCallsPerMinute}/min)` }
  }

  return { allowed: true }
}
