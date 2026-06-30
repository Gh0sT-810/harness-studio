export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export type ParsedLogLine = {
  lineNumber: number
  timestamp?: string
  level: LogLevel
  message: string
  raw: string
}

/** Severity ordering for minimum-level filtering (higher = more severe). */
export const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

const LEVEL_PATTERN = /\b(TRACE|DEBUG|INFO|NOTICE|WARN|WARNING|ERROR|ERR|CRITICAL|FATAL)\b/i
const TIMESTAMP_PATTERN = /^\s*\[?(\d{4}-\d{2}-\d{2}[ T][\d:.,]+Z?)\]?/

function normalizeLevel(raw: string): LogLevel {
  const value = raw.toLowerCase()
  if (value.startsWith('warn')) return 'warn'
  if (value === 'err' || value.startsWith('error') || value === 'critical' || value === 'fatal') return 'error'
  if (value === 'trace' || value === 'debug') return 'debug'
  return 'info'
}

/**
 * Parses raw log text into structured lines. Tolerant by design: lines without
 * a recognizable level fall back to `info`, and a timestamp is extracted only
 * when it leads the line. The raw line is always preserved for display/search.
 */
export function parseLogContent(content: string): ParsedLogLine[] {
  if (!content) return []
  const lines = content.split(/\r?\n/)
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines.map((raw, index) => {
    const timestampMatch = raw.match(TIMESTAMP_PATTERN)
    const timestamp = timestampMatch?.[1]
    const levelMatch = raw.match(LEVEL_PATTERN)
    // The message excludes the leading timestamp so the viewer can render it in
    // a dedicated dimmed column (matching the mockup's `.logline .t`) without
    // duplicating it inline. `raw` keeps the full line for search.
    const message = timestampMatch ? raw.slice(timestampMatch[0].length).trimStart() : raw
    return {
      lineNumber: index + 1,
      timestamp,
      level: levelMatch ? normalizeLevel(levelMatch[1]) : 'info',
      message,
      raw,
    }
  })
}

/** Applies the minimum-level + free-text search filters to parsed lines. */
export function filterLogLines(
  lines: ParsedLogLine[],
  { minLevel, query }: { minLevel: LogLevel | null; query: string },
): ParsedLogLine[] {
  const normalizedQuery = query.trim().toLowerCase()
  const minRank = minLevel ? LOG_LEVEL_ORDER[minLevel] : -1
  return lines.filter((line) => {
    if (minLevel && LOG_LEVEL_ORDER[line.level] < minRank) return false
    if (normalizedQuery && !line.raw.toLowerCase().includes(normalizedQuery)) return false
    return true
  })
}
