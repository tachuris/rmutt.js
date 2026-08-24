import { HighlightStyle, StreamLanguage, type StringStream } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

const IDENTIFIER = /^[_a-zA-Z][a-zA-Z0-9_-]*/
const RULE_NAME_LOOKAHEAD = /^\s*(\[[^\]]*\])?\s*[:=]/
const KEYWORDS = new Set(['package', 'import', 'from'])
const INCLUDE = /^#include\b/
const REPETITION_BRACES = /^\{\s*\d+(\s*,\s*\d+)?\s*\}/
const DOUBLE_STRING = /^"(?:[^"\\\n]|\\.)*"/
const SINGLE_STRING = /^'(?:[^'\\\n]|\\.)*'/

type Frame = { kind: 'template' } | { kind: 'interp'; depth: number }

interface State {
  stack: Frame[]
  atStatementStart: boolean
}

function templateToken(stream: StringStream, state: State): string {
  if (stream.match('${')) {
    state.stack.push({ kind: 'interp', depth: 1 })
    return 'string'
  }
  if (stream.match('`')) {
    state.stack.pop()
    return 'string'
  }
  if (stream.match(/^\\./)) return 'string'
  // A run of plain template text, up to the next backtick, `${`, or escape.
  do {
    stream.next()
  } while (
    !stream.eol() &&
    stream.peek() !== '`' &&
    stream.peek() !== '\\' &&
    stream.string.slice(stream.pos, stream.pos + 2) !== '${'
  )
  return 'string'
}

function token(stream: StringStream, state: State): string | null {
  if (stream.sol() && state.stack.length === 0) state.atStatementStart = true

  const top = state.stack[state.stack.length - 1]
  if (top?.kind === 'template') return templateToken(stream, state)

  // `{3}` / `{1,5}` are self-contained and don't affect interpolation brace depth.
  if (stream.match(REPETITION_BRACES)) {
    state.atStatementStart = false
    return 'repetition'
  }

  if (top?.kind === 'interp') {
    if (stream.match('{')) {
      top.depth++
      return null
    }
    if (stream.match('}')) {
      top.depth--
      if (top.depth === 0) state.stack.pop()
      return null
    }
  }

  if (stream.eatSpace()) return null

  if (stream.match('//')) {
    stream.skipToEnd()
    state.atStatementStart = false
    return 'comment'
  }

  if (stream.match(INCLUDE)) {
    state.atStatementStart = false
    return 'keyword'
  }

  if (stream.match(DOUBLE_STRING) || stream.match(SINGLE_STRING)) {
    state.atStatementStart = false
    return 'string'
  }

  if (stream.match('`')) {
    state.stack.push({ kind: 'template' })
    state.atStatementStart = false
    return 'string'
  }

  if (stream.match(/^[?*+]/)) {
    state.atStatementStart = false
    return 'repetition'
  }

  if (stream.match(/^0\.\d+/) || stream.match(/^\d+/)) {
    state.atStatementStart = false
    return 'weight'
  }

  if (stream.match('>')) {
    state.atStatementStart = false
    return 'transformation'
  }

  const atTopLevel = top == null
  const id = stream.match(IDENTIFIER)
  if (id != null && typeof id !== 'boolean') {
    const wasAtStart = atTopLevel && state.atStatementStart
    state.atStatementStart = false
    const word = id[0]
    if (word != null && KEYWORDS.has(word)) return 'keyword'
    if (wasAtStart && RULE_NAME_LOOKAHEAD.test(stream.string.slice(stream.pos))) {
      return 'ruleName'
    }
    return null
  }

  if (stream.match(';')) {
    if (atTopLevel) state.atStatementStart = true
    return null
  }

  stream.next()
  return null
}

export const rmuttLanguage = StreamLanguage.define<State>({
  name: 'rmutt',
  startState: () => ({ stack: [], atStatementStart: true }),
  token,
  tokenTable: {
    comment: t.comment,
    string: t.string,
    ruleName: t.definition(t.variableName),
    keyword: t.keyword,
    transformation: t.operator,
    weight: t.number,
    repetition: t.modifier,
  },
})

export const rmuttHighlightStyle = HighlightStyle.define([
  { tag: t.comment, color: 'var(--tok-comment)', fontStyle: 'italic' },
  { tag: t.string, color: 'var(--tok-string)' },
  { tag: t.definition(t.variableName), color: 'var(--tok-function)' },
  { tag: t.keyword, color: 'var(--tok-keyword)', fontWeight: 600 },
  { tag: t.operator, color: 'var(--tok-operator)' },
  { tag: t.special(t.operator), color: 'var(--tok-control)' },
  { tag: t.number, color: 'var(--tok-number)' },
  { tag: t.modifier, color: 'var(--tok-quantifier)' },
])
