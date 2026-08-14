[![CI](https://github.com/tachuris/rmutt.js/actions/workflows/ci.yml/badge.svg)](https://github.com/tachuris/rmutt.js/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/rmutt.svg)](https://www.npmjs.com/package/rmutt)
[![zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](package.json)

# rmutt.js

> **rmutt.js** is a transpiled language
> for generating random strings from
> [context-sensitive grammars](https://en.wikipedia.org/wiki/Context-sensitive_grammar).

That may sound a bit dry but can actually result in
**a tremendous amount of fun** and several
practical and not so practical applications. Any application where random combinations of symbols can provoke _amusing_, _aesthetic_ or _inspirational_ effects, can be implemented with relative ease using **rmutt.js**.

**rmutt.js** is a reimplementation of the C project
[rmutt](http://sourceforge.net/projects/rmutt/) by Joe Futrelle.

Read more about it:

## Quick start

```bash
$ npm install rmutt
```

```javascript
import { expand } from 'rmutt'

// The first rule is the entry point, so `top` is what gets expanded.
const { expanded } = await expand('top: greeting " world"; greeting: "hello"|"hi"|"hey";')
// => "hey world"
```

Or from the command line:

```bash
echo 'night-sky:("." 5, " " 100, "*"){100000};' | npx rmutt
```

**Requires Node 22+. ESM-only, with zero runtime dependencies.**
CommonJS callers can still `require('rmutt')`.

Read more about it:

- An [overview](docs/OVERVIEW.md) of **rmutt.js**.
- The [user's guide](docs/GUIDE.md) to _rmutt grammars_.
- The [command-line interface](docs/CLI.md).
- The [JavaScript API](docs/API.md), if you dare!
- Some [example rmutt grammars](./examples/) to find inspiration.

## Development

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`.

### Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

## Possible application domains

- Parody ([Postmodern essay generator](https://en.wikipedia.org/wiki/Postmodernism_Generator), [High-energy theory paper generator](http://davidsd.org/2010/03/the-snarxiv/) and [more](https://en.wikipedia.org/wiki/Parody_generator))
- Literature ([cut-up technique](https://en.wikipedia.org/wiki/Cut-up_technique), [infinite monkeys](https://en.wikipedia.org/wiki/Infinite_monkey_theorem#Random_document_generation))
- Visual arts ([Context Free Art](http://www.contextfreeart.org/), [Structure Synth](http://structuresynth.sourceforge.net/))
- Music ([algorithmic composition](https://en.wikipedia.org/wiki/Algorithmic_composition#Grammars))
- Game design ([procedural content generation](http://www.di.uniba.it/~vessio/drafts/NCMA-2014_CR.pdf))
- Code testing ([test case generation](http://www.monkeys.com/m4r/))
- Brainstorming ([Random Input technique](http://www.sociology.org.uk/as4i3ri.pdf))
- Web design (Lorem ipsum on steroids)
- Chat bots and all kinds of _Artificial Stupidity_ agents (you know, so called A.I. agents but honestly not intelligent at all)
- You got the idea :)

---
