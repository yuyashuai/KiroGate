// KiroGate 调试模块 - 记录完整的请求和响应用于调试

export interface DebugSession {
  id: string
  timestamp: number
  method: string
  path: string
  apiKeyId?: string
  accountId?: string
  model: string
  requestedModel?: string

  // 请求详情
  requestHeaders: Record<string, string>
  requestBody: unknown
  prompt: {
    system?: string
    messages: Array<{
      role: string
      content: string | unknown[]
    }>
    tools?: unknown[]
  }

  // 响应详情
  responseStatus: number
  responseHeaders: Record<string, string>
  responseBody?: unknown
  responseText?: string
  streamChunks?: string[]

  // 性能指标
  duration: number
  inputTokens?: number
  outputTokens?: number

  // 错误信息
  error?: string
  errorStack?: string
}

class DebugStore {
  private sessions: Map<string, DebugSession> = new Map()
  private maxSessions = 100 // 最多保存 100 个 session
  private enabled = true

  setEnabled(enabled: boolean) {
    this.enabled = enabled
  }

  isEnabled(): boolean {
    return this.enabled
  }

  createSession(data: Partial<DebugSession>): string {
    if (!this.enabled) return ''

    const id = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
    const session: DebugSession = {
      id,
      timestamp: Date.now(),
      method: data.method || 'POST',
      path: data.path || '/unknown',
      model: data.model || 'unknown',
      requestHeaders: data.requestHeaders || {},
      requestBody: data.requestBody,
      prompt: data.prompt || { messages: [] },
      responseStatus: 0,
      responseHeaders: {},
      duration: 0,
      ...data
    }

    this.sessions.set(id, session)

    // 清理旧的 session
    if (this.sessions.size > this.maxSessions) {
      const oldestKey = Array.from(this.sessions.keys())[0]
      this.sessions.delete(oldestKey)
    }

    return id
  }

  updateSession(id: string, data: Partial<DebugSession>) {
    if (!this.enabled || !id) return

    const session = this.sessions.get(id)
    if (session) {
      Object.assign(session, data)
    }
  }

  getSession(id: string): DebugSession | undefined {
    return this.sessions.get(id)
  }

  getAllSessions(): DebugSession[] {
    return Array.from(this.sessions.values()).sort((a, b) => b.timestamp - a.timestamp)
  }

  clearSessions() {
    this.sessions.clear()
  }

  getStats() {
    return {
      totalSessions: this.sessions.size,
      maxSessions: this.maxSessions,
      enabled: this.enabled
    }
  }
}

export const debugStore = new DebugStore()

// 辅助函数：从请求中提取 prompt 信息
export function extractPromptFromOpenAI(body: any): DebugSession['prompt'] {
  return {
    system: body.messages?.find((m: any) => m.role === 'system')?.content,
    messages: body.messages?.map((m: any) => ({
      role: m.role,
      content: m.content
    })) || [],
    tools: body.tools
  }
}

export function extractPromptFromClaude(body: any): DebugSession['prompt'] {
  return {
    system: typeof body.system === 'string' ? body.system : body.system?.[0]?.text,
    messages: body.messages?.map((m: any) => ({
      role: m.role,
      content: m.content
    })) || [],
    tools: body.tools
  }
}

// 辅助函数：记录流式响应
export class StreamDebugger {
  private chunks: string[] = []
  private sessionId: string

  constructor(sessionId: string) {
    this.sessionId = sessionId
  }

  addChunk(chunk: string) {
    this.chunks.push(chunk)
  }

  finish() {
    debugStore.updateSession(this.sessionId, {
      streamChunks: this.chunks,
      responseText: this.chunks.join('')
    })
  }
}
