import { EditorState, type Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'

export const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'transparent',
    color: 'var(--ink)',
  },
  '.cm-content': {
    fontFamily: 'var(--mono)',
    fontSize: '12.5px',
    lineHeight: '1.6',
    caretColor: 'var(--caret)',
  },
  '.cm-cursor': {
    borderLeftColor: 'var(--caret)',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'var(--ink-faint)',
    border: 'none',
  },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: 'var(--selection)',
  },
  // CodeMirror's default placeholder is a light box, unreadable on a dark ground.
  '.cm-foldPlaceholder': {
    backgroundColor: 'var(--ground-3)',
    border: '1px solid var(--rule)',
    color: 'var(--ink-dim)',
  },
})

export const editorAttributes = EditorView.contentAttributes.of({
  spellcheck: 'false',
  autocapitalize: 'off',
  autocorrect: 'off',
})

/** No line wrapping: matches the old `<textarea wrap="off">`. */
export const sharedExtensions: Extension[] = [
  editorTheme,
  editorAttributes,
  EditorState.tabSize.of(2),
]
