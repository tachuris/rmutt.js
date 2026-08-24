export type Origin =
  | { kind: 'example'; name: string }
  | { kind: 'share'; fragment: string }

export interface AutosaveRecord {
  source: string
  origin: Origin
  /** The example this buffer came from. Absent once an edit detached it. */
  example?: string
}

const KEY = 'rmutt:autosave'

export function readAutosave(): AutosaveRecord | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw == null) return null
    const parsed: unknown = JSON.parse(raw)
    return isAutosaveRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** Returns whether the write succeeded. Quota limits and private browsing can
    fail it silently otherwise. */
export function writeAutosave(
  source: string,
  origin: Origin,
  example: string | undefined,
): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify({ source, origin, example }))
    return true
  } catch {
    return false
  }
}

export function originsEqual(a: Origin, b: Origin): boolean {
  if (a.kind === 'example' && b.kind === 'example') return a.name === b.name
  if (a.kind === 'share' && b.kind === 'share') return a.fragment === b.fragment
  return false
}

function isOrigin(value: unknown): value is Origin {
  if (typeof value !== 'object' || value == null) return false
  const kind = (value as Record<string, unknown>)['kind']
  if (kind === 'example')
    return typeof (value as Record<string, unknown>)['name'] === 'string'
  if (kind === 'share')
    return typeof (value as Record<string, unknown>)['fragment'] === 'string'
  return false
}

function isAutosaveRecord(value: unknown): value is AutosaveRecord {
  if (typeof value !== 'object' || value == null) return false
  const record = value as Record<string, unknown>
  if (record['example'] != null && typeof record['example'] !== 'string') return false
  return typeof record['source'] === 'string' && isOrigin(record['origin'])
}
