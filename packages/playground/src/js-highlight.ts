import { HighlightStyle } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

/** Dark Modern's token colors, mapped onto the tags @lezer/javascript emits. */
export const jsHighlightStyle = HighlightStyle.define([
  { tag: t.comment, color: 'var(--tok-comment)' },
  { tag: [t.string, t.special(t.string), t.deleted], color: 'var(--tok-string)' },
  { tag: t.regexp, color: 'var(--tok-regexp)' },
  { tag: t.escape, color: 'var(--tok-quantifier)' },
  { tag: [t.number, t.inserted], color: 'var(--tok-number)' },
  {
    tag: [
      t.keyword,
      t.operatorKeyword,
      t.definitionKeyword,
      t.atom,
      t.bool,
      t.self,
      t.null,
    ],
    color: 'var(--tok-keyword)',
  },
  { tag: [t.controlKeyword, t.moduleKeyword], color: 'var(--tok-control)' },
  {
    tag: [t.operator, t.punctuation, t.separator, t.derefOperator],
    color: 'var(--tok-operator)',
  },
  {
    tag: [t.variableName, t.definition(t.variableName), t.propertyName, t.attributeName],
    color: 'var(--tok-variable)',
  },
  {
    tag: [
      t.function(t.variableName),
      t.function(t.definition(t.variableName)),
      t.function(t.propertyName),
      t.standard(t.variableName),
    ],
    color: 'var(--tok-function)',
  },
  { tag: [t.typeName, t.className, t.namespace, t.tagName], color: 'var(--tok-type)' },
  {
    tag: [t.constant(t.variableName), t.special(t.variableName)],
    color: 'var(--tok-constant)',
  },
  { tag: t.labelName, color: 'var(--tok-label)' },
  { tag: t.meta, color: 'var(--tok-punct)' },
  { tag: t.link, color: 'var(--accent-text)', textDecoration: 'underline' },
  { tag: t.heading, color: 'var(--tok-keyword)', fontWeight: 'bold' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strong, fontWeight: 'bold' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.invalid, color: 'var(--tok-invalid)' },
])
