import { transpile } from 'rmutt'
import { EXAMPLES, type ExampleEntry } from 'virtual:examples-manifest'
import { originsEqual, readAutosave, writeAutosave, type Origin } from './autosave.js'
import { createEditor } from './editor.js'
import { createHtmlView, looksLikeHtml, type HtmlView } from './html-view.js'
import { resolveInclude } from './include-resolver.js'
import { decodeShareFragment, encodeShareFragment, type SharePayload } from './share.js'
import { createTranspileView, type TranspileView } from './transpile-view.js'
import { toRunError } from './worker/run-grammar.js'
import { createExpansionRunner } from './worker/client.js'
import type { RunError, RunRequest, RunResult } from './worker/protocol.js'

const REPO_URL = 'https://github.com/tachuris/rmutt.js#readme'
const LANDING_EXAMPLE = 'recipe.rm'
const TRANSPILE_DEBOUNCE_MS = 300

type TranspileState =
  | { status: 'pending' }
  | { status: 'ok'; code: string }
  | { status: 'error'; error: RunError }

interface State {
  source: string
  /** The picked example, or `undefined` once an edit detached the buffer. */
  example: string | undefined
  result: RunResult | null
  /** Last successful `expanded`. Kept while an error or a stop stands, dimmed. */
  lastGood: string | null
  running: boolean
  tab: 'output' | 'transpile'
  /** How the Output tab shows the expansion: as text, or rendered. */
  outputAs: 'text' | 'html'
  /** Phone-only Grammar/Output switch. Desktop ignores it. */
  mode: 'grammar' | 'output'
  /** Computed lazily: on opening the Transpile tab, or editing while it's open. */
  transpile: TranspileState | null
  /** Selected entry rule. `undefined` defers to the grammar's own `$entry`. */
  entry: string | undefined
  iteration: number | undefined
  randomSeed: number | undefined
  /** From the last run that reached expand(), for the entry dropdown. */
  ruleNames: string[]
  defaultEntry: string | undefined
}

interface Els {
  exampleSelect: HTMLSelectElement
  entrySelect: HTMLSelectElement
  iterationInput: HTMLInputElement
  seedInput: HTMLInputElement
  modes: HTMLElement
  modeGrammar: HTMLButtonElement
  modeOutput: HTMLButtonElement
  shareBtn: HTMLButtonElement
  runBtn: HTMLButtonElement
  body: HTMLElement
  paneGrammar: HTMLElement
  paneOutput: HTMLElement
  editorHost: HTMLElement
  foot: HTMLElement
  divider: HTMLElement
  tabOutput: HTMLButtonElement
  tabTranspile: HTMLButtonElement
  viewHtml: HTMLInputElement
  viewHtmlField: HTMLElement
  outputMeta: HTMLElement
  outputHost: HTMLElement
}

export async function mountApp(root: HTMLElement): Promise<void> {
  root.innerHTML = shellMarkup()
  const els = queryEls(root)
  const editor = createEditor()
  const runner = createExpansionRunner()
  const transpileView = createTranspileView()
  const htmlView = createHtmlView()

  const state: State = {
    source: '',
    example: LANDING_EXAMPLE,
    result: null,
    lastGood: null,
    running: false,
    tab: 'output',
    outputAs: 'text',
    mode: 'grammar',
    transpile: null,
    entry: undefined,
    iteration: undefined,
    randomSeed: undefined,
    ruleNames: [],
    defaultEntry: undefined,
  }

  // Guards stale transpile() resolutions and skips a recompute when the
  // source hasn't changed since the last one.
  let transpileToken = 0
  let transpiledFor: string | null = null
  let transpileTimer: ReturnType<typeof setTimeout> | null = null

  // Bumped by every trigger that starts a run
  let runGen = 0

  let detectHtmlPending = false

  // Both feed the footer's autosave indicator and the reload rule.
  let currentOrigin: Origin = { kind: 'example', name: LANDING_EXAMPLE }
  let lastAutosaveOk = true

  populateExamplePicker(els.exampleSelect, EXAMPLES)
  els.editorHost.append(editor.element)

  editor.onChange(value => {
    // An edit detaches the buffer from the example: the picker clears, and a
    // share link made from here carries no name.
    // setValue() marks its transaction programmatic, so a load never lands here.
    setExample(undefined)
    detectHtmlPending = false
    state.source = value
    state.running = true
    lastAutosaveOk = writeAutosave(value, currentOrigin, state.example)
    render()
    const token = ++runGen
    runner.runDebounced(currentRequest(), result => applyResult(token, result), 300)
    if (state.tab === 'transpile') scheduleTranspile()
  })

  els.exampleSelect.addEventListener('change', () => {
    // Clear a stale share fragment, or a later reload would re-decode it
    // and override the pick.
    if (location.hash !== '')
      history.replaceState(null, '', location.pathname + location.search)
    void loadExample(els.exampleSelect.value)
  })

  els.shareBtn.addEventListener('click', () => {
    void doShare()
  })

  els.entrySelect.addEventListener('change', () => {
    state.entry = els.entrySelect.value
    void runAgain()
  })

  els.iterationInput.addEventListener('input', () => {
    state.iteration = parseIntOrUndefined(els.iterationInput.value)
    runDebouncedFromControl()
  })

  els.seedInput.addEventListener('input', () => {
    state.randomSeed = parseIntOrUndefined(els.seedInput.value)
    runDebouncedFromControl()
  })

  els.runBtn.addEventListener('click', () => {
    if (state.running) {
      stopRun()
      return
    }
    // Drop seed and iteration so generation can run fresh.
    state.randomSeed = undefined
    state.iteration = undefined
    els.seedInput.value = ''
    els.iterationInput.value = ''
    void runAgain()
  })

  els.tabOutput.addEventListener('click', () => {
    state.tab = 'output'
    render()
  })
  els.tabTranspile.addEventListener('click', () => {
    state.tab = 'transpile'
    if (transpiledFor !== state.source) scheduleTranspile(0)
    render()
  })
  els.viewHtml.addEventListener('change', () => {
    state.outputAs = els.viewHtml.checked ? 'html' : 'text'
    render()
  })
  els.modeGrammar.addEventListener('click', () => {
    state.mode = 'grammar'
    render()
  })
  els.modeOutput.addEventListener('click', () => {
    state.mode = 'output'
    render()
  })

  wireDivider(els.divider, els.body)

  /** Keeps the picker on the buffer's example, cleared when it has none. */
  function setExample(name: string | undefined): void {
    state.example = name
    if (name == null) els.exampleSelect.selectedIndex = -1
    else els.exampleSelect.value = name
  }

  function currentRequest(): RunRequest {
    return {
      source: state.source,
      entry: state.entry,
      iteration: state.iteration,
      randomSeed: state.randomSeed,
    }
  }

  function runDebouncedFromControl(): void {
    state.running = true
    render()
    const token = ++runGen
    runner.runDebounced(currentRequest(), result => applyResult(token, result), 300)
  }

  /** Applies a result unless a newer trigger has already superseded it. */
  function applyResult(token: number, result: RunResult): void {
    if (token !== runGen) return
    state.result = result
    state.running = false
    if (detectHtmlPending) {
      detectHtmlPending = false
      if (result.status === 'ok' && looksLikeHtml(result.expanded))
        state.outputAs = 'html'
    }
    if (result.status === 'ok') {
      state.lastGood = result.expanded
      updateEntryInfo(result.ruleNames, result.defaultEntry)
    } else if (result.status === 'error' && result.error.kind === 'not-text') {
      updateEntryInfo(result.error.ruleNames, result.error.defaultEntry)
    }
    render()
  }

  /** Keeps the entry dropdown in sync, defaulting when the pinned rule no
      longer exists (a fresh example, or an edit that removed it). */
  function updateEntryInfo(ruleNames: string[], defaultEntry: string | undefined): void {
    state.ruleNames = ruleNames
    state.defaultEntry = defaultEntry
    if (state.entry == null || !ruleNames.includes(state.entry))
      state.entry = defaultEntry
  }

  function scheduleTranspile(delayMs = TRANSPILE_DEBOUNCE_MS): void {
    if (transpileTimer != null) clearTimeout(transpileTimer)
    transpileTimer = setTimeout(() => {
      transpileTimer = null
      void runTranspile()
    }, delayMs)
  }

  async function runTranspile(): Promise<void> {
    const source = state.source
    const token = ++transpileToken
    state.transpile = { status: 'pending' }
    render()
    try {
      const { transpiled } = await transpile(source, { resolveInclude })
      if (token !== transpileToken) return
      transpiledFor = source
      state.transpile = { status: 'ok', code: transpiled }
    } catch (error) {
      if (token !== transpileToken) return
      transpiledFor = source
      state.transpile = { status: 'error', error: toRunError(error) }
    }
    render()
  }

  function stopRun(): void {
    runner.stop()
    runGen++ // any in-flight result is now stale
    state.running = false
    state.result = { status: 'stopped' }
    render()
  }

  async function runAgain(): Promise<void> {
    runner.stop()
    state.running = true
    render()
    const token = ++runGen
    applyResult(token, await runner.run(currentRequest()))
  }

  async function loadExample(name: string): Promise<void> {
    let source: string
    try {
      source = await fetchExample(name)
    } catch (error) {
      runner.stop()
      runGen++
      state.example = name
      state.tab = 'output'
      state.result = { status: 'error', error: fetchErrorToRunError(error) }
      state.lastGood = null
      state.running = false
      render()
      return
    }
    await applyBuffer(source, name, { kind: 'example', name }, {})
  }

  /** Decodes a share fragment and loads it. Returns false on a broken link. */
  async function loadShare(fragment: string): Promise<boolean> {
    const payload = await decodeShareFragment(fragment)
    if (payload == null) return false
    await applyBuffer(
      payload.source,
      payload.example,
      { kind: 'share', fragment },
      {
        entry: payload.entry,
        iteration: payload.iteration,
        randomSeed: payload.randomSeed,
        outputAs: payload.outputAs,
      },
    )
    return true
  }

  /** Common tail of every load. Used for a fresh example, a fresh share
      link, and restoring either from the autosave slot on boot. */
  async function applyBuffer(
    source: string,
    example: string | undefined,
    origin: Origin,
    controls: {
      entry?: string
      iteration?: number
      randomSeed?: number
      outputAs?: string
    },
  ): Promise<void> {
    runner.stop()
    runGen++
    transpileToken++ // invalidates any in-flight transpile
    transpiledFor = null
    state.transpile = null
    state.tab = 'output'
    state.source = source
    editor.setValue(source)
    state.lastGood = null
    state.result = null
    state.entry = controls.entry
    state.iteration = controls.iteration
    state.randomSeed = controls.randomSeed
    state.ruleNames = []
    state.defaultEntry = undefined
    state.outputAs = controls.outputAs === 'html' ? 'html' : 'text'
    detectHtmlPending = controls.outputAs == null
    els.iterationInput.value =
      controls.iteration != null ? String(controls.iteration) : ''
    els.seedInput.value = controls.randomSeed != null ? String(controls.randomSeed) : ''
    setExample(example)
    currentOrigin = origin
    lastAutosaveOk = writeAutosave(source, origin, state.example)
    state.running = true
    render()
    const token = ++runGen
    applyResult(token, await runner.run(currentRequest()))
  }

  async function doShare(): Promise<void> {
    const result = state.result
    const payload: SharePayload = {
      v: 1,
      source: state.source,
      example: state.example,
      entry: state.entry,
      iteration: state.iteration,
      randomSeed:
        result?.status === 'ok' && typeof result.randomSeed === 'number'
          ? result.randomSeed
          : undefined,
      outputAs: state.outputAs,
    }
    const fragment = await encodeShareFragment(payload)
    const url = `${location.origin}${location.pathname}#${fragment}`
    try {
      await navigator.clipboard.writeText(url)
      flashShareBtn('Copied')
    } catch {
      flashShareBtn('Copy failed')
    }
  }

  function flashShareBtn(text: string): void {
    els.shareBtn.textContent = text
    els.shareBtn.disabled = true
    setTimeout(() => {
      els.shareBtn.textContent = 'Share'
      els.shareBtn.disabled = false
    }, 1500)
  }

  function render(): void {
    renderRail(els, state)
    renderPaneHead(els, state)
    renderFoot(els, state, lastAutosaveOk)
    renderOutput(els, state, transpileView, htmlView)
  }

  await boot()

  async function boot(): Promise<void> {
    const fragment = location.hash.slice(1) || null
    const autosaved = readAutosave()

    if (fragment != null) {
      const origin: Origin = { kind: 'share', fragment }
      if (autosaved != null && originsEqual(autosaved.origin, origin)) {
        await restoreShare(autosaved.source, origin, autosaved.example)
        return
      }
      const ok = await loadShare(fragment)
      if (!ok) {
        await loadExample(LANDING_EXAMPLE)
        state.result = {
          status: 'error',
          error: { kind: 'unknown', message: 'This share link could not be read.' },
        }
        render()
      }
      return
    }

    // No link: the buffer leads, whichever example it came from. Comparing
    // it against the landing example here is what used to drop the work.
    if (autosaved != null) {
      if (autosaved.origin.kind === 'share') {
        await restoreShare(autosaved.source, autosaved.origin, autosaved.example)
      } else {
        await applyBuffer(autosaved.source, autosaved.example, autosaved.origin, {})
      }
      return
    }

    await loadExample(LANDING_EXAMPLE)
  }

  /** Restores a buffer forked from a share link, taking the controls the link pinned. */
  async function restoreShare(
    source: string,
    origin: Origin & { kind: 'share' },
    example: string | undefined,
  ): Promise<void> {
    const payload = await decodeShareFragment(origin.fragment)
    await applyBuffer(source, example, origin, {
      entry: payload?.entry,
      iteration: payload?.iteration,
      randomSeed: payload?.randomSeed,
      outputAs: payload?.outputAs,
    })
  }
}

function fetchErrorToRunError(error: unknown): RunError {
  return {
    kind: 'unknown',
    message: error instanceof Error ? error.message : String(error),
  }
}

async function fetchExample(name: string): Promise<string> {
  // No leading slash: resolves against the document URL, so it works under
  // both dev's root and the build's /rmutt.js/ base without knowing which.
  const response = await fetch(`examples/${name}`)
  if (!response.ok) throw new Error(`could not load ${name} (${response.status})`)
  return response.text()
}

function queryEls(root: HTMLElement): Els {
  const get = <T extends Element>(selector: string): T => {
    const el = root.querySelector<T>(selector)
    if (el == null) throw new Error(`app shell markup is missing ${selector}`)
    return el
  }
  return {
    exampleSelect: get('#example'),
    entrySelect: get('#entry'),
    iterationInput: get('#iteration'),
    seedInput: get('#seed'),
    modes: get('#modes'),
    modeGrammar: get('[data-mode-btn="grammar"]'),
    modeOutput: get('[data-mode-btn="output"]'),
    shareBtn: get('#share'),
    runBtn: get('#run'),
    body: get('#body'),
    paneGrammar: get('#pane-grammar'),
    paneOutput: get('#pane-output'),
    editorHost: get('#editor-host'),
    foot: get('#foot'),
    divider: get('#divider'),
    tabOutput: get('#tab-output'),
    tabTranspile: get('#tab-transpile'),
    viewHtml: get('#view-html'),
    viewHtmlField: get('#view-html-field'),
    outputMeta: get('#output-meta'),
    outputHost: get('#output-host'),
  }
}

function shellMarkup(): string {
  return `
    <div class="rail">
      <a class="mark" href="${REPO_URL}" target="_blank" rel="noreferrer">rmutt.js</a>
      <div class="field">
        <label for="example">example</label>
        <select id="example"></select>
      </div>
      <div class="field">
        <label for="entry">entry</label>
        <select id="entry"></select>
      </div>
      <div class="field">
        <label for="iteration">iteration</label>
        <input type="number" id="iteration" class="num" step="1" placeholder="random" />
      </div>
      <div class="field">
        <label for="seed">seed</label>
        <input type="number" id="seed" class="num" step="1" placeholder="random" />
      </div>
      <div class="spacer"></div>
      <div class="modes" id="modes">
        <button type="button" data-mode-btn="grammar" aria-pressed="true">Grammar</button>
        <button type="button" data-mode-btn="output" aria-pressed="false">Output</button>
      </div>
      <a class="link wide-only" href="${REPO_URL}" target="_blank" rel="noreferrer"
        >What is this?</a
      >
      <button type="button" class="btn" id="share">Share</button>
      <button type="button" class="btn btn-primary" id="run">Randomize</button>
    </div>
    <div class="body" id="body">
      <section class="pane" id="pane-grammar" data-mode="on">
        <div class="editor-host scroll" id="editor-host"></div>
        <div class="pane-foot meta" id="foot"></div>
      </section>
      <div class="divider" id="divider" role="separator" aria-orientation="vertical"></div>
      <section class="pane" id="pane-output" data-mode="off">
        <div class="pane-head">
          <div class="tabs">
            <button type="button" class="tab" id="tab-output" aria-selected="true">Output</button>
            <button type="button" class="tab" id="tab-transpile" aria-selected="false">Transpile</button>
          </div>
          <label class="check" id="view-html-field">
            <input type="checkbox" id="view-html" />
            <span><span class="wide-only">View as </span>HTML</span>
          </label>
          <span class="meta" id="output-meta"></span>
        </div>
        <div class="output-host scroll" id="output-host"></div>
      </section>
    </div>
  `
}

function populateExamplePicker(
  select: HTMLSelectElement,
  examples: readonly ExampleEntry[],
): void {
  const grammars = document.createElement('optgroup')
  grammars.label = 'grammars'
  const libraries = document.createElement('optgroup')
  libraries.label = 'libraries — meant to be included'

  for (const entry of examples) {
    const option = document.createElement('option')
    option.value = entry.name
    option.textContent = entry.name
    ;(entry.isLibrary ? libraries : grammars).append(option)
  }

  select.append(grammars, libraries)
  select.value = LANDING_EXAMPLE
}

function renderRail(els: Els, state: State): void {
  els.runBtn.textContent = state.running ? 'Stop' : 'Randomize'
  els.runBtn.classList.toggle('btn-primary', !state.running)
  els.modeGrammar.setAttribute('aria-pressed', String(state.mode === 'grammar'))
  els.modeOutput.setAttribute('aria-pressed', String(state.mode === 'output'))
  renderEntrySelect(els.entrySelect, state)
}

/** Rebuilds the optgroups only when the rule set actually changed, so an
    open dropdown or mid-typing focus isn't disturbed on every render. */
function renderEntrySelect(select: HTMLSelectElement, state: State): void {
  const signature = state.ruleNames.join(' ')
  if (select.dataset['sig'] !== signature) {
    select.dataset['sig'] = signature
    select.replaceChildren(...entryOptgroups(state.ruleNames))
  }
  if (state.entry != null) select.value = state.entry
}

/**
 * Groups rule names by namespace prefix: `this grammar` first, then one
 * optgroup per included file's package prefix, in first-appearance order.
 */
function entryOptgroups(ruleNames: readonly string[]): HTMLOptGroupElement[] {
  const own: string[] = []
  const byPrefix = new Map<string, string[]>()

  for (const name of ruleNames) {
    const dot = name.indexOf('.')
    if (dot === -1) {
      own.push(name)
      continue
    }
    const prefix = name.slice(0, dot)
    const list = byPrefix.get(prefix)
    if (list == null) byPrefix.set(prefix, [name])
    else list.push(name)
  }

  const groups: HTMLOptGroupElement[] = []
  if (own.length > 0) {
    groups.push(buildOptgroup('this grammar', own, name => name))
  }
  for (const [prefix, names] of byPrefix) {
    groups.push(buildOptgroup(prefix, names, name => name.slice(prefix.length + 1)))
  }
  return groups
}

function buildOptgroup(
  label: string,
  names: readonly string[],
  textFor: (name: string) => string,
): HTMLOptGroupElement {
  const optgroup = document.createElement('optgroup')
  optgroup.label = label
  for (const name of names) {
    const option = document.createElement('option')
    option.value = name
    option.textContent = textFor(name)
    optgroup.append(option)
  }
  return optgroup
}

function parseIntOrUndefined(value: string): number | undefined {
  if (value.trim() === '') return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

function renderPaneHead(els: Els, state: State): void {
  els.paneGrammar.dataset['mode'] = state.mode === 'grammar' ? 'on' : 'off'
  els.paneOutput.dataset['mode'] = state.mode === 'output' ? 'on' : 'off'

  els.tabOutput.setAttribute('aria-selected', String(state.tab === 'output'))
  els.tabTranspile.setAttribute('aria-selected', String(state.tab === 'transpile'))

  els.viewHtml.checked = state.outputAs === 'html'
  els.viewHtmlField.hidden = state.tab === 'transpile'
}

function renderFoot(els: Els, state: State, autosaveOk: boolean): void {
  const result = state.result

  if (result?.status === 'error') {
    els.foot.className = 'pane-foot err'
    els.foot.replaceChildren(...errorNodes(result.error))
    return
  }

  els.foot.className = 'pane-foot meta'
  if (result?.status === 'stopped') {
    els.foot.textContent = 'stopped'
    return
  }
  const lines = state.source === '' ? 0 : state.source.split('\n').length
  const saveStatus = autosaveOk ? 'autosaved' : 'not saved'
  els.foot.textContent = `${lines} lines · ${saveStatus}`
}

function errorNodes(error: RunError): Node[] {
  const nodes: Node[] = []

  const head = document.createElement('div')
  head.className = 'err-head'
  head.textContent = errorHeadline(error)
  nodes.push(head)

  const source = error.kind === 'syntax' ? error.grammarSource : undefined
  if (source != null) {
    const where = document.createElement('div')
    where.className = 'err-body'
    where.textContent = `in ${source}`
    nodes.push(where)
  }

  const pre = errorPre(error)
  if (pre != null) {
    const preEl = document.createElement('pre')
    preEl.textContent = pre
    nodes.push(preEl)
  }

  return nodes
}

function errorHeadline(error: RunError): string {
  // peggy's snippet already restates the message with location and a caret.
  // repeating it in the headline would show the same text twice.
  if (error.kind === 'syntax' && error.snippet != null) return 'Syntax error'
  // run-grammar.ts always resolves a concrete rule name for 'not-text'
  // (request.entry, or the table's own $entry), so message already names it.
  return error.message
}

function errorPre(error: RunError): string | null {
  if (error.kind === 'syntax') return error.snippet ?? null
  if (error.kind === 'runaway') return error.trace
  return null
}

function renderOutput(
  els: Els,
  state: State,
  transpileView: TranspileView,
  htmlView: HtmlView,
): void {
  if (state.tab === 'transpile') {
    renderTranspile(els, state, transpileView)
    return
  }

  const dim = state.result?.status === 'error' || state.result?.status === 'stopped'
  const text = state.lastGood

  if (text == null) {
    els.outputHost.replaceChildren(
      placeholder(state.running ? 'Expanding…' : 'Nothing yet.'),
    )
  } else if (text === '') {
    els.outputHost.replaceChildren(
      placeholder(
        'The grammar expanded to nothing. Its entry rule produced an empty string — legal, and rarely what you meant.',
      ),
    )
  } else if (state.outputAs === 'html') {
    htmlView.setContent(text)
    htmlView.element.classList.toggle('stale', dim)
    // Re-inserting an iframe reloads its document, so mount it only once.
    if (els.outputHost.firstChild !== htmlView.element)
      els.outputHost.replaceChildren(htmlView.element)
  } else {
    const out = document.createElement('div')
    out.className = dim ? 'out stale' : 'out'
    out.textContent = text
    els.outputHost.replaceChildren(out)
  }

  els.outputMeta.textContent = outputMetaText(state)
}

function renderTranspile(els: Els, state: State, transpileView: TranspileView): void {
  const t = state.transpile
  if (t == null || t.status === 'pending') {
    els.outputHost.replaceChildren(placeholder('Transpiling…'))
    els.outputMeta.textContent = ''
    return
  }
  if (t.status === 'error') {
    els.outputHost.replaceChildren(...errorNodes(t.error))
    els.outputMeta.textContent = ''
    return
  }
  transpileView.setContent(t.code)
  els.outputHost.replaceChildren(transpileView.element)
  els.outputMeta.textContent = `${t.code.split('\n').length} lines`
}

function placeholder(text: string): HTMLElement {
  const el = document.createElement('div')
  el.className = 'out placeholder'
  el.textContent = text
  return el
}

function outputMetaText(state: State): string {
  const result = state.result
  if (result?.status !== 'ok') return ''
  const lines = result.expanded === '' ? 0 : result.expanded.split('\n').length
  const parts = [`${lines} lines`, `${result.expanded.length} chars`]
  // iteration wins over randomSeed for every choice (payload/runtime.ts).
  // showing a seed alongside it would misrepresent what produced the output.
  if (state.iteration == null && result.randomSeed != null) {
    const seed = Array.isArray(result.randomSeed)
      ? result.randomSeed.join(',')
      : result.randomSeed
    parts.push(`seed ${seed}`)
  }
  return parts.join(' · ')
}

function wireDivider(divider: HTMLElement, body: HTMLElement): void {
  divider.addEventListener('pointerdown', event => {
    divider.setPointerCapture(event.pointerId)
    divider.classList.add('dragging')

    const move = (ev: PointerEvent): void => {
      const rect = body.getBoundingClientRect()
      const px = Math.min(Math.max(ev.clientX - rect.left, 180), rect.width - 180)
      body.style.setProperty('--split', `${px}px`)
    }
    const up = (): void => {
      divider.classList.remove('dragging')
      divider.removeEventListener('pointermove', move)
      divider.removeEventListener('pointerup', up)
    }
    divider.addEventListener('pointermove', move)
    divider.addEventListener('pointerup', up)
  })
}
