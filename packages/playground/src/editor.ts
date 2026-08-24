import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { syntaxHighlighting } from '@codemirror/language'
import { Annotation } from '@codemirror/state'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { sharedExtensions } from './editor-theme.js'
import { rmuttHighlightStyle, rmuttLanguage } from './rmutt-language.js'

export interface Editor {
  readonly element: HTMLElement
  getValue(): string
  setValue(value: string): void
  onChange(listener: (value: string) => void): void
}

// Marks setValue's transaction so onChange can skip it
const programmatic = Annotation.define<boolean>()

export function createEditor(): Editor {
  let listener: ((value: string) => void) | null = null

  const view = new EditorView({
    doc: '',
    extensions: [
      lineNumbers(),
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      rmuttLanguage,
      syntaxHighlighting(rmuttHighlightStyle),
      ...sharedExtensions,
      EditorView.updateListener.of(update => {
        if (!update.docChanged) return
        if (update.transactions.some(tr => tr.annotation(programmatic) === true)) return
        listener?.(update.state.doc.toString())
      }),
    ],
  })

  return {
    element: view.dom,
    getValue: () => view.state.doc.toString(),
    setValue: value => {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
        annotations: programmatic.of(true),
      })
    },
    onChange: l => {
      listener = l
    },
  }
}
