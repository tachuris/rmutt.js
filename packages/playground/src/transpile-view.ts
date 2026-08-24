import { javascript } from '@codemirror/lang-javascript'
import { foldEffect, foldGutter, syntaxHighlighting } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { sharedExtensions } from './editor-theme.js'
import { jsHighlightStyle } from './js-highlight.js'

const FOLD_MARKER = '\n$root.rule('

export interface TranspileView {
  readonly element: HTMLElement
  setContent(code: string): void
}

export function createTranspileView(): TranspileView {
  const view = new EditorView({
    doc: '',
    extensions: [
      javascript(),
      syntaxHighlighting(jsHighlightStyle),
      foldGutter(),
      EditorState.readOnly.of(true),
      ...sharedExtensions,
    ],
  })

  return {
    element: view.dom,
    setContent: code => {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: code } })
      const markerAt = code.indexOf(FOLD_MARKER)
      if (markerAt < 0) return
      view.dispatch({ effects: foldEffect.of({ from: 0, to: markerAt + 1 }) })
    },
  }
}
