import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vite-plus/test'

import { compile } from '../src/index.js'

const examplesDir = fileURLToPath(new URL('../../../examples/', import.meta.url))

const examples = [
  'addresses',
  'author',
  'bands',
  'chars',
  'dialogue',
  'directions',
  'dissertation',
  'dotree',
  'eng',
  'gramma',
  'grammar',
  'jcr_sv',
  'math',
  'neruda',
  'numbers',
  'password',
  'password2',
  'recipe',
  'sentence',
  'slogan',
  'spew',
  'spew_xml',
  'story',
  'sva',
  'template',
  'tree',
  'turing',
  'url',
  'wine',
  'xml',
]

describe('examples as smoke-tests', () => {
  for (const name of examples) {
    it(name, async () => {
      const grammar = readFileSync(`${examplesDir}${name}.rm`, 'utf8')
      const { compiled } = await compile(grammar, { workingDir: examplesDir })
      const { expanded } = compiled({ randomSeed: 1 })

      expect(typeof expanded).toBe('string')
    })
  }
})
