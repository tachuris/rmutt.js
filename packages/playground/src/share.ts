export interface SharePayload {
  v: 1
  source: string
  example?: string
  entry?: string
  iteration?: number
  randomSeed?: number
  outputAs?: string
}

const CHUNK = 0x8000

export async function encodeShareFragment(payload: SharePayload): Promise<string> {
  const json = JSON.stringify(payload)
  if (typeof CompressionStream === 'function') {
    const bytes = await deflateRaw(new TextEncoder().encode(json))
    return `z1${bytesToBase64Url(bytes)}`
  }
  return `p1${encodeURIComponent(json)}`
}

export async function decodeShareFragment(
  fragment: string,
): Promise<SharePayload | null> {
  try {
    const scheme = fragment.slice(0, 2)
    const body = fragment.slice(2)
    let json: string
    if (scheme === 'z1') {
      json = new TextDecoder().decode(await inflateRaw(base64UrlToBytes(body)))
    } else if (scheme === 'p1') {
      json = decodeURIComponent(body)
    } else {
      return null
    }
    const parsed: unknown = JSON.parse(json)
    return isSharePayload(parsed) ? parsed : null
  } catch {
    return null
  }
}

async function deflateRaw(
  bytes: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  return pump(bytes, new CompressionStream('deflate-raw'))
}

async function inflateRaw(
  bytes: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  return pump(bytes, new DecompressionStream('deflate-raw'))
}

/** Writes and reads concurrently, so write errors surface here instead of
    becoming unhandled rejections. */
async function pump(
  bytes: Uint8Array<ArrayBuffer>,
  stream: {
    readable: ReadableStream<Uint8Array>
    writable: WritableStream<BufferSource>
  },
): Promise<Uint8Array<ArrayBuffer>> {
  const writer = stream.writable.getWriter()
  const [, buffer] = await Promise.all([
    writer.write(bytes).then(() => writer.close()),
    new Response(stream.readable).arrayBuffer(),
  ])
  return new Uint8Array(buffer)
}

/** Chunked. Spreading a large array into String.fromCharCode in one call can
    hit the call-stack argument limit. */
function bytesToBase64Url(bytes: Uint8Array<ArrayBuffer>): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const padded = b64url.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function isSharePayload(value: unknown): value is SharePayload {
  if (typeof value !== 'object' || value == null) return false
  const record = value as Record<string, unknown>
  if (record['v'] !== 1) return false
  if (typeof record['source'] !== 'string') return false
  if (record['example'] != null && typeof record['example'] !== 'string') return false
  if (record['entry'] != null && typeof record['entry'] !== 'string') return false
  if (record['iteration'] != null && typeof record['iteration'] !== 'number') return false
  if (record['randomSeed'] != null && typeof record['randomSeed'] !== 'number')
    return false
  if (record['outputAs'] != null && typeof record['outputAs'] !== 'string') return false
  return true
}
