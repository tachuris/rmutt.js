import { relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vite-plus/test'

import { compile, expand, expandSync } from '../src/index.js'
import type { ExpandOptions } from '../src/index.js'

async function expectUsingIteration(
  grammar: string,
  expected: (string | undefined)[],
  options: ExpandOptions = {},
): Promise<void> {
  const { compiled } = await compile(grammar, options)
  const results = expected.map(
    (_value, index) => compiled({ ...options, iteration: index }).expanded,
  )
  expect(results).toEqual(expected)
}

async function testProbabilities(grammar: string, expected: number[]): Promise<void> {
  const { compiled } = await compile(grammar)
  const output: number[] = []

  for (let i = 1; i <= 1000; i++) {
    const value = Number(compiled({}).expanded)
    output[value] = (output[value] ?? 0) + 1
  }

  let sum = 0
  for (let i = 0; i <= expected.length - 1; i++) sum += output[i] ?? 0
  for (let i = 0; i <= expected.length - 1; i++) {
    output[i] = Math.round((10 * (output[i] ?? 0)) / sum) / 10
  }

  expect(output).toEqual(expected)
}

describe('expansion', () => {
  it('more than one dash in rule identifier', async () => {
    const grammar = 'a-b-c:"x";'
    await expectUsingIteration(grammar, ['x'])
  })
  it('choice selection', async () => {
    const grammar = 't: "0"|"1"|"2";'
    await expectUsingIteration(grammar, ['0', '1', '2'])
  })
  it('generates random seed (number by default)', async () => {
    const grammar = 't: $options.randomSeed;'
    const result = await expand(grammar)
    expect(result.options.randomSeedType).toEqual('integer')
    expect(typeof result.options.randomSeed).toBe('number')
    expect(result.options.randomSeed).toEqual(Number(result.expanded))
  })
  it('uses random seed', async () => {
    const grammar = 't: "0"|"1"|"2";'
    const result = await expand(grammar, { randomSeed: 12345 })
    expect(result.options.randomSeed).toEqual(12345)
  })
  it('generates array random seed', async () => {
    const grammar = 't: "0"|"1"|"2";'
    const result = await expand(grammar, { randomSeedType: 'array' })
    expect(result.options.randomSeedType).toEqual('array')
    expect(result.options.randomSeed).toBeInstanceOf(Array)
    expect(result.options.randomSeed).toHaveLength(16)
  })
  it('empty choice', async () => {
    const grammar = 'soldOut: | |  |    "<b>SOLD OUT</b>" | |  |;'
    await expectUsingIteration(grammar, ['', '', '', '<b>SOLD OUT</b>', ''])
  })
  it('shuffle and reshuffle', async () => {
    const grammar = 't: (s{4} " "){6};\ns: & "0","1","2",(&& "x","y","z");'
    const result = await expand(grammar, { randomSeed: 0 })
    expect(result.expanded).toEqual('10z2 10y2 10x2 10x2 10z2 10y2 ')

    // TODO: specify (re)shuffle on invocation
  })
  it('t2 - recursion', async () => {
    const grammar = 't: "0"|a;\na: "1"|t;'
    await expectUsingIteration(grammar, [
      '0',
      '1',
      '0',
      '0',
      '0',
      '1',
      '0',
      '1',
      '0',
      '1',
      '0',
      '0',
      '0',
      '1',
      '0',
      '0',
    ])
  })
  it('t2b - circular recursion', async () => {
    const grammar = 'foo: "yes" bar;\nbar: foo;'
    await expect(expand(grammar)).rejects.toThrow(/Maximum call stack size exceeded/)
  })
  it('t2c - configurable maximum stack depth', async () => {
    const grammar = 'foo: "yes" bar;\nbar: foo;'
    await expectUsingIteration(grammar, ['yesyesyesyesyesyesyesyesyesyes'], {
      maxStackDepth: 20,
    })
  })
  it('t3 - anonymous rules', async () => {
    const grammar = 't: "a" ("b"|"c") "d";'
    await expectUsingIteration(grammar, ['abd', 'acd'])
  })
  it('t4 - nested anonymous rules', async () => {
    const grammar = 't: "a" ("b"|("c"|"d"));'
    await expectUsingIteration(grammar, ['ab', 'ac', 'ab', 'ad'])
  })
  it('t5 - repetition', async () => {
    const grammar = 't: "a"{2} "b"{2,3} "c"? "d"* "e"+;'
    await expectUsingIteration(grammar, [
      'aabbe',
      'aabbbe',
      'aabbce',
      'aabbbce',
      'aabbde',
      'aabbbde',
      'aabbcde',
      'aabbbcde',
      'aabbdde',
      'aabbbdde',
      'aabbcdde',
      'aabbbcdde',
      'aabbddde',
      'aabbbddde',
      'aabbcddde',
      'aabbbcddde',
      'aabbdddde',
      'aabbbdddde',
      'aabbcdddde',
      'aabbbcdddde',
      'aabbddddde',
      'aabbbddddde',
      'aabbcddddde',
      'aabbbcddddde',
    ])
  })
  it('repeat with variety', async () => {
    const grammar = 'top: id[a]{2};\na: "x", "y";\nid[w]: w;'
    await expectUsingIteration(grammar, ['xx', 'yx', 'xy', 'yy'])
  })
  it('repetition in package', async () => {
    const grammar = 'package p;\ntop: r{1};\nr: "R";'
    await expectUsingIteration(grammar, ['R'])
  })
  it('t6 - embedded definitions', async () => {
    const grammar = 't: (a: "0" | "1") a;'
    await expectUsingIteration(grammar, ['0', '1'])
  })
  it('embedded definitions', async () => {
    const grammar =
      'meta-vp:\n(iv: "ate") (prep: "with") vp,\n(iv: "yelled") (prep: "at") vp,\n(iv: "waited") (prep: "for","on","with") vp;\nvp: iv " " adv " " pp;\npp: prep " " obj;\nobj: "you", "me";\nadv: "patiently", "impatiently";'
    const { compiled } = await compile(grammar)
    expect(compiled({ iteration: 0 }).expanded).toEqual('ate patiently with you')
    expect(compiled({ iteration: 200 }).expanded).toEqual('waited patiently for me')
    expect(compiled({ iteration: 400 }).expanded).toEqual('yelled impatiently at you')
  })
  it('t7 - variables', async () => {
    const grammar = 't: (a = "0" | "1") a a;'
    await expectUsingIteration(grammar, ['00', '11'])
  })
  it('variable', async () => {
    const grammar =
      's: (character = name, position) character " said, \'I am " character ", so nice to meet you.\'";\nname: title " " firstName " " lastName;\ntitle: "Dr.", "Mr.", "Mrs.", "Ms";\nfirstName: "Nancy", "Reginald", "Edna", "Archibald";\nlastName: "McPhee", "Eaton-Hogg", "Worthingham";\nposition: "the butler", "the chauffeur";'
    await expectUsingIteration(grammar, [
      "Dr. Nancy McPhee said, 'I am Dr. Nancy McPhee, so nice to meet you.'",
      "the butler said, 'I am the butler, so nice to meet you.'",
    ])
  })
  it('indirection', async () => {
    const grammar =
      'start:  sentence-about[animal];\nanimal: "dog", "cat";\nsentence-about[subject]: @subject " is a " subject;\ndog: "Fido", "Spot";\ncat: "Tiddles", "Fluffy";'
    await expectUsingIteration(grammar, [
      'Fido is a dog',
      'Tiddles is a cat',
      'Spot is a dog',
      'Fluffy is a cat',
    ])
  })
  it('t8 - mappings', async () => {
    const grammar = 'a: b > ("0" % "a" "1" % "b");\nb: "0" | "1";'
    await expectUsingIteration(grammar, ['a', 'b'])
  })
  it('t8a - mappings', async () => {
    const grammar = 'a: "i like to eat apples and bananas" > "i" % "u";'
    await expectUsingIteration(grammar, ['u luke to eat apples and bananas'])
  })
  it('t8b - mappings', async () => {
    const grammar = 'a: "i like to eat apples and bananas" > ("i" % u);\nu: "u";'
    await expectUsingIteration(grammar, ['u luke to eat apples and bananas'])
  })
  it('mapping in package', async () => {
    const grammar = 'package test;\ntop: "xxx" > "x" % a;\na: "y";'
    await expectUsingIteration(grammar, ['yyy'])
  })
  it('t13 - complex mapping syntax', async () => {
    const grammar = 'a: ("a"|"b")>("a"%("0"|"zero") "b"%("1"|"one"));'
    await expectUsingIteration(grammar, ['0', '1', 'zero', 'one'])
  })
  it('t9 - regexes', async () => {
    const grammar = 'a: "i like to eat apples and bananas" > /[aeiou]+/oo/;'
    await expectUsingIteration(grammar, ['oo lookoo too oot oopploos oond boonoonoos'])
  })
  it('t9b - regexes', async () => {
    const grammar = 'a: "i like to eat apples and bananas" > (/[aeiou]+/oo/ /loo/x/);'
    await expectUsingIteration(grammar, ['oo xkoo too oot ooppxs oond boonoonoos'])
  })
  it('t9c - backreferences', async () => {
    const grammar = 'a: "a bad apple" > /a (.+) (.+)/i want the \\2s \\1ly/;'
    await expectUsingIteration(grammar, ['i want the apples badly'])
  })
  it('t9 - regexes with /', async () => {
    const grammar = 'a: "a // //// b" > /[\\/]+/-/;'
    await expectUsingIteration(grammar, ['a - - b'])
  })
  it('t10 - transformation chaining', async () => {
    const grammar =
      'thing: name > deleteVowels > slangify > deleteVowels;\ndeleteVowels: /[aeiou]//;\nslangify: "chck" % "chiggidy" "snp" % "snippidy";\nname: "check" | "chuck" | "snap" | "snipe";'
    await expectUsingIteration(grammar, ['chggdy', 'chggdy', 'snppdy', 'snppdy'])
  })
  it('transformation 1', async () => {
    const grammar = 'a: "abc" > ("b" % "x");'
    await expectUsingIteration(grammar, ['axc'])
  })
  it('transformation 2', async () => {
    const grammar = 'a: "abc" > b;\nb: "b" % "x";'
    await expectUsingIteration(grammar, ['axc'])
  })
  it('transformation 3', async () => {
    const grammar = 'a: "abc" > b;\nb: "b" % "x" "c" % "y";'
    await expectUsingIteration(grammar, ['axy'])
  })
  it('packages', async () => {
    const grammar =
      'package p1;\n\na: b p2.a;\nb: "p1b";\n\npackage p2;\n\na: " p2a " b;\nb: "p2b";'
    await expectUsingIteration(grammar, ['p1b p2a p2b'])
  })
  it('t11 - packages', async () => {
    const grammar =
      'package lesson;\n\nsentence: o " starts with the letter \'O\', " greeting.o;\no: "oatmeal" | "ogre";\n\npackage greeting;\n\ns: "hello there " o;\no: "beautiful" | "Mr. Smarty Pants";'
    await expectUsingIteration(grammar, [
      "oatmeal starts with the letter 'O', beautiful",
      "ogre starts with the letter 'O', beautiful",
      "oatmeal starts with the letter 'O', Mr. Smarty Pants",
      "ogre starts with the letter 'O', Mr. Smarty Pants",
    ])
  })
  describe('quantifier', () => {
    it('t12 - probability multipliers', async () => {
      const grammar = 'package test;\na: "0" 3| "1";'
      // in iteration mode, quantifier is ignored
      await expectUsingIteration(grammar, ['0', '1', '0', '1'])
    })
    it('t12b - ignore multiplier outside choice', async () => {
      const grammar = 'package test;\na: "x" "y" "z" 3;'
      await expectUsingIteration(grammar, ['xyz'])
    })
    it('cumulated probabilities', async () => {
      const grammar = 't: "0", "1" 0.1, "2", "3" 0.5;'
      const expected = [0.2, 0.1, 0.2, 0.5]
      await testProbabilities(grammar, expected)
    })
    it('cumulated multipliers', async () => {
      const grammar = 't: "0", "1" 2, "2", "3" 6;'
      const expected = [0.1, 0.2, 0.1, 0.6]
      await testProbabilities(grammar, expected)
    })
    it('combined quantifiers', async () => {
      const grammar = 't: "0" 2, "1" 0.1, "2";'
      const expected = [0.6, 0.1, 0.3]
      await testProbabilities(grammar, expected)

      // TODO: test against calculated distribution instead (or too?)
    })
  })
  it('t14 - includes', async () => {
    // Exercises resolveInclude's process.cwd()-relative fallback (no `from`
    // given), so the include path must be relative to the actual cwd the
    // test runs under rather than a path relative to this file.
    const t14bPath = relative(
      process.cwd(),
      fileURLToPath(new URL('t14b.rm', import.meta.url)),
    )
    const grammar = `#include "${t14bPath}"\na: b;`
    await expectUsingIteration(grammar, ['yes!'])
  })
  describe('rule arguments', () => {
    it('t16 - positional arguments', async () => {
      const grammar =
        'foo: (bar["thing","blah","foo"] "ie"){20};\nbar[a,b,c]: "i like " _1 " and " b " and " _3;'
      await expectUsingIteration(grammar, [
        'i like thing and blah and fooiei like thing and blah and fooiei like thing and blah and fooiei like thing and blah and fooiei like thing and blah and fooiei like thing and blah and fooiei like thing and blah and fooiei like thing and blah and fooiei like thing and blah and fooiei like thing and blah and fooiei like thing and blah and fooiei like thing and blah and fooiei like thing and blah and fooiei like thing and blah and fooiei like thing and blah and fooiei like thing and blah and fooiei like thing and blah and fooiei like thing and blah and fooiei like thing and blah and fooiei like thing and blah and fooie',
      ])
    })
    it('terms as argument', async () => {
      const grammar = 'top: a[b c];\na[x]: x;'
      await expectUsingIteration(grammar, ['bc'])
    })
    it('rule invocation as argument', async () => {
      const grammar = 'package test;\ntop: a[b["c"]];\na[p]:p;\nb[p]:p;'
      await expectUsingIteration(grammar, ['c'])
    })
    it('argument has local precedence in package', async () => {
      const grammar = "package test;\ntop: a['x'];\na[p]: p;\np: 'y';"
      await expectUsingIteration(grammar, ['x'])
    })
  })
  describe('scope', () => {
    it('t15 - scope qualifiers', async () => {
      const grammar =
        'r: ((a="foo") a ($b="bar")) b " "\n((c:"foo"|"bar") c ($d:"baz"|"quux") d) d "\\n";'
      await expectUsingIteration(grammar, [
        'foobar foobazbaz\n',
        'foobar barbazbaz\n',
        'foobar fooquuxbaz\n',
        'foobar barquuxbaz\n',
        'foobar foobazquux\n',
        'foobar barbazquux\n',
        'foobar fooquuxquux\n',
        'foobar barquuxquux\n',
      ])

      // more examples of parent: math.rm, sva.rm
      // more examples of root: turing.rm, SecomPR.rm
    })
    it('t17 - scope qualifiers: parent', async () => {
      const grammar =
        'tests:\n local.top " "\n root.top " "\n parent.top " "\n;\n\npackage local;\n\ntop: A X;\n\nA: (X="1") B X;\nB: (X="2") C X;\nC: (X="3") X;\n\npackage parent;\n\ntop: A X;\n\nA: (X="1") B X;\nB: (X="2") C X;\nC: (^X="3") X;\n\npackage root;\n\ntop: A X;\n\nA: (X="1") B X;\nB: (X="2") C X;\nC: ($X="3") X;'
      await expectUsingIteration(grammar, ['321local.X 2213 331parent.X '])
    })
  })
  it('t18 - imports', async () => {
    const grammar =
      'top: baz.quux;\n\npackage foo;\n\nbar: "quux"|"fnord";\n\npackage baz;\n\nimport bar from foo;\n\nquux: "snooby " bar;\n'
    await expectUsingIteration(grammar, ['snooby quux', 'snooby fnord'])
  })
  it('multiple import', async () => {
    const grammar =
      'package util;\nxuc: /a/ % "A";\nuc[text]: text > xuc;\nxtc: /^a/ % "A";\ntc[text]: text > xtc;\n\npackage test;\nimport uc, tc from util;\ntop: tc["aaa"] " " uc["aaa"];'
    await expectUsingIteration(grammar, ['Aaa AAA'], { entry: 'test.top' })
  })
  describe('entry rule', () => {
    const grammar = 'a:"A";\nb:"B";\nc:"C";'
    it('first rule by default', async () => {
      const result = await expand(grammar)
      expect(result.expanded).toEqual('A')
    })
    it('defined in transpilation', async () => {
      const { compiled } = await compile(grammar, { entry: 'b' })
      expect(compiled({}).expanded).toEqual('B')
    })
    it('override defined in transpilation', async () => {
      const { compiled } = await compile(grammar, { entry: 'b' })
      expect(compiled({ entry: 'c' }).expanded).toEqual('C')
    })

    describe('when the grammar has none', () => {
      // A file that only includes: the include's entry does not survive it.
      const includeOnly = {
        resolveInclude: () => ({ source: 'inner: "hello";', base: '' }),
        grammarSource: 'main.rm',
      }

      it('fails naming the grammar, rather than expanding to nothing', async () => {
        const { compiled } = await compile('#include "inner.rm"', includeOnly)
        expect(() => compiled({})).toThrow(
          /No entry rule in 'main\.rm'.*Pass 'entry', one of: inner/,
        )
      })

      it('still expands when the caller names an entry', async () => {
        const { compiled } = await compile('#include "inner.rm"', includeOnly)
        expect(compiled({ entry: 'inner' }).expanded).toEqual('hello')
      })

      it('says so when there are no rules at all', () => {
        expect(() => expandSync({}).expanded).toThrow(
          /Nothing to expand: the grammar defines no rules/,
        )
      })
    })
  })
  describe('template string', () => {
    it('interpolates rule invocations', async () => {
      const grammar = 'top: `a${u}c`;\nu: "b";'
      await expectUsingIteration(grammar, ['abc'])
    })
    it('interpolates choices', async () => {
      const grammar = 'top: `[${"a"|"b"}]`;'
      await expectUsingIteration(grammar, ['[a]', '[b]'])
    })
    it('keeps literal newlines', async () => {
      const grammar = 'top: `a\nb`;'
      await expectUsingIteration(grammar, ['a\nb'])
    })
    it('expands escapes, including the delimiters', async () => {
      const grammar = 'top: `a\\`b\\${c\\td`;'
      await expectUsingIteration(grammar, ['a`b${c\td'])
    })
    it('interpolates a code block', async () => {
      const grammar = 'top: `1+2=${{ return 1+2 }}`;'
      await expectUsingIteration(grammar, ['1+2=3'])
    })
    it('nests', async () => {
      const grammar = 'top: `a${`b${u}`}d`;\nu: "c";'
      await expectUsingIteration(grammar, ['abcd'])
    })
    it('carries variables and repetition like any other term', async () => {
      const grammar = 'top: (n = "x"|"y") `${n}!`{2};'
      await expectUsingIteration(grammar, ['x!x!', 'y!y!'])
    })
    it('serves as a mapping replacement', async () => {
      const grammar = 'top: "a-c" > "-"%`${u}`;\nu: "b";'
      await expectUsingIteration(grammar, ['abc'])
    })
    it('always produces a string, never a transformation', async () => {
      // `concat` filters non-strings, so a lone interpolation that expands to
      // a function yields ''. That is the point: a template is a string.
      // Generating `compose` here (what a `Terms` node would do) would leak a
      // function out of a string literal.
      const fn = 'f: {\n  return function (input) { return input + "!" };\n};'
      await expectUsingIteration(`top: \`\${f}\`;\n${fn}`, [''])
      await expectUsingIteration(`top: \`\${f}\${f}\`;\n${fn}`, [''])
    })
    it('drops a non-string interpolation, like the juxtaposed form', async () => {
      const options = { externals: { count: () => 3 } }
      await expectUsingIteration('top: `n=${count[""]}`;', ['n='], options)
      await expectUsingIteration('top: "n=" count[""];', ['n='], options)
    })
  })
  describe('code block', () => {
    it('evaluates rule arguments as local variables', async () => {
      const grammar = 'top: fn["1","2","3"];\nfn[a, b, c]: {\n  return c + b + a;\n};'
      await expectUsingIteration(grammar, ['321'])
    })
    it('evaluates anonymous expression', async () => {
      const grammar = 'top: "1+2=" ({ return 1+2 });'
      await expectUsingIteration(grammar, ['1+2=3'])
    })
    it('evaluates undefined as empty string', async () => {
      const grammar = 'top: { return };'
      await expectUsingIteration(grammar, [''])
    })
    it('evaluates null as empty string', async () => {
      const grammar = 'top: { return null };'
      await expectUsingIteration(grammar, [''])
    })
    it('evaluates expression in package', async () => {
      const grammar =
        'package test;\ntop: fn["1", "2", "3"];\nfn[a, b, c]: {\n  return c + b + a;\n};'
      await expectUsingIteration(grammar, ['321'])
    })
    it('evaluates expression with curly brackets', async () => {
      const grammar =
        'top: fn["x" | "y" | "z"];\nfn[k]: {\n  var map = {\n    x: 1,\n    y: 2,\n    z: 3\n  };\n  return map[k];\n};'
      await expectUsingIteration(grammar, ['1', '2', '3'])
    })
    it('evaluates named rule as transformation', async () => {
      const grammar =
        'top: "abcd" > (asciify["b"] "c"%"x" asciify["d"]);\nasciify[char]: {\n  return function (input) {\n    return input.replace(char, char.charCodeAt(0));\n  };\n};'
      await expectUsingIteration(grammar, ['a98x100'])
    })
    it('evaluates anonymous rule as transformation', async () => {
      const grammar =
        'top: "abcd" > (\n  "c"%"x"\n  ({\n    return function (input) {\n      return input.toUpperCase();\n    };\n  })\n);'
      await expectUsingIteration(grammar, ['ABXD'])
    })
  })
  describe('external rules', () => {
    it('handles missing transformation', async () => {
      const grammar = 'top: expr " = " (expr > calc);\nexpr: "1 + 2";'
      await expectUsingIteration(grammar, ['1 + 2 = 1 + 2'])
      // .to.throw /'calc' is not a function/
    })
    it('used as transformation', async () => {
      const grammar = 'top: expr " = " (expr > calc);\nexpr: "1 + 2";'
      const options = {
        // oxlint-disable-next-line no-eval
        externals: { calc: (input: string) => String(eval(input)) },
      }

      await expectUsingIteration(grammar, ['1 + 2 = 3'], options)
    })
    it('handles missing parameterized rule', async () => {
      const grammar = 'top: expr " = " calc[expr];\nexpr: "1 + 2";'
      await expect(expand(grammar)).rejects.toThrow(/Missing parameterized rule/)
    })
    it('used as parameterized rule', async () => {
      const grammar = 'top: expr " = " calc[expr, "USD"];\nexpr: "1 + 2";'
      const options = {
        externals: {
          // oxlint-disable-next-line no-eval
          calc: (input: string, unit: string) => unit + ' ' + String(eval(input)),
        },
      }

      await expectUsingIteration(grammar, ['1 + 2 = USD 3'], options)
    })
    it('used as variable', async () => {
      const grammar = 'top: name;'
      const options = { externals: { name: 'value' } }

      await expectUsingIteration(grammar, ['value'], options)
    })
    it('used as composed transformation', async () => {
      const grammar = 'top: "abcd" > (asciify["b"] "c"%"x" asciify["d"]);'
      const options = {
        externals: {
          asciify: (char: string) => (input: string) =>
            input.replace(char, String(char.charCodeAt(0))),
        },
      }

      await expectUsingIteration(grammar, ['a98x100'], options)

      // TODO: #include externals.js
    })
  })
})
