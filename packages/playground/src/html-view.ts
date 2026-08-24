/** Renders expanded output as a web page inside a sandboxed iframe. */

export interface HtmlView {
  readonly element: HTMLElement
  setContent(html: string): void
}

export function createHtmlView(): HtmlView {
  const frame = document.createElement('iframe')
  frame.className = 'out-frame'
  // sandbox="" tells the browser to give the frame an opaque origin and
  // disable scripts, so grammar output can't touch the page or its autosave slot.
  frame.setAttribute('sandbox', '')
  frame.title = 'Output rendered as HTML'

  let current: string | null = null

  const write = (html: string): void => {
    frame.srcdoc = withTheme(html)
  }

  return {
    element: frame,
    setContent: html => {
      // render() runs on every keystroke, and each srcdoc assignment reloads
      // the document.
      if (html === current) return
      current = html
      write(html)
    },
  }
}

const LEADING_DOCTYPE = /^\s*<!doctype[^>]*>/i

/** Prepends the playground's theme, keeping a leading doctype first so the
    browser doesn't drop into quirks mode. */
function withTheme(html: string): string {
  const style = themeStyle()
  const doctype = LEADING_DOCTYPE.exec(html)
  if (doctype == null) return style + html
  const end = doctype[0].length
  return html.slice(0, end) + style + html.slice(end)
}

/**
 * Reads the live values off the host document, so style.css stays the one
 * place that defines the palette. Output that ships its own styles takes
 * precedence: this block comes first.
 */
function themeStyle(): string {
  const root = getComputedStyle(document.documentElement)
  const token = (name: string): string => root.getPropertyValue(name).trim()
  return `<style>
    html { color-scheme: dark; }
    body {
      margin: 0;
      padding: 0.9rem 1.1rem 3rem;
      background: ${token('--ground-2')};
      color: ${token('--ink')};
      font: 400 14px/1.6 ${token('--sans')};
    }
    a { color: ${token('--accent-text')}; }
    code, kbd, pre, samp { font-family: ${token('--mono')}; }
    hr { border: 0; border-top: 1px solid ${token('--rule')}; }
    table { border-color: ${token('--rule')}; }
  </style>`
}

// looksLikeHtml treats a name outside this list as XML. This keeps `<foo>`
// and `<asparagus>` out.
const HTML_TAGS = new Set([
  'a',
  'article',
  'aside',
  'b',
  'blockquote',
  'body',
  'br',
  'button',
  'code',
  'dd',
  'div',
  'dl',
  'dt',
  'em',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'head',
  'header',
  'hr',
  'html',
  'i',
  'img',
  'input',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'picture',
  'pre',
  'q',
  's',
  'section',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'u',
  'ul',
  'video',
])

const LEADING_TAG = /^\s*<([a-z][a-z0-9]*)(?=[\s/>])/i
const DOCTYPE = /^\s*<!doctype\s+html/i

/** Whether text opens with an HTML tag. `<?xml …` and other XML is not. */
export function looksLikeHtml(text: string): boolean {
  if (DOCTYPE.test(text)) return true
  const match = LEADING_TAG.exec(text)
  return match != null && HTML_TAGS.has(match[1]!.toLowerCase())
}
