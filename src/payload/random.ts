/**
 * A stripped-down copy of https://github.com/ckknight/random-js
 *
 * Unused branches (int53, uint53Full, discard, autoSeed, nativeMath)
 * are kept to make updates easier.
 */

/** A random engine: returns a signed 32-bit integer. */
export type Engine = () => number

export interface MT19937Engine extends Engine {
  discard(count: number): MT19937Engine
  seed(initial: number): MT19937Engine
  seedWithArray(source: number[]): MT19937Engine
  autoSeed(): MT19937Engine
}

/** `Math.imul`, with a fallback for engines lacking a correct one. */
const imul: (a: number, b: number) => number =
  typeof Math.imul !== 'function' || Math.imul(0xffffffff, 5) !== -5
    ? (a: number, b: number): number => {
        const ah = (a >>> 16) & 0xffff
        const al = a & 0xffff
        const bh = (b >>> 16) & 0xffff
        const bl = b & 0xffff
        // the shift by 0 fixes the sign on the high part
        // the final |0 converts the unsigned value into a signed value
        return (al * bl + (((ah * bl + al * bh) << 16) >>> 0)) | 0
      }
    : Math.imul

// -- mt19937 ---------------------------------------------------------------
// http://en.wikipedia.org/wiki/Mersenne_twister

function refreshData(data: Int32Array): void {
  let k = 0
  let tmp = 0

  for (; (k | 0) < 227; k = (k + 1) | 0) {
    tmp = (data[k] & 0x80000000) | (data[(k + 1) | 0] & 0x7fffffff)
    data[k] = data[(k + 397) | 0] ^ (tmp >>> 1) ^ (tmp & 0x1 ? 0x9908b0df : 0)
  }

  for (; (k | 0) < 623; k = (k + 1) | 0) {
    tmp = (data[k] & 0x80000000) | (data[(k + 1) | 0] & 0x7fffffff)
    data[k] = data[(k - 227) | 0] ^ (tmp >>> 1) ^ (tmp & 0x1 ? 0x9908b0df : 0)
  }

  tmp = (data[623] & 0x80000000) | (data[0] & 0x7fffffff)
  data[623] = data[396] ^ (tmp >>> 1) ^ (tmp & 0x1 ? 0x9908b0df : 0)
}

function temper(value: number): number {
  value ^= value >>> 11
  value ^= (value << 7) & 0x9d2c5680
  value ^= (value << 15) & 0xefc60000
  return value ^ (value >>> 18)
}

function seedDataWithArray(data: Int32Array, source: number[]): void {
  let i = 1
  let j = 0
  const sourceLength = source.length
  let k = Math.max(sourceLength, 624) | 0
  let previous = data[0] | 0

  for (; (k | 0) > 0; --k) {
    data[i] = previous =
      ((data[i] ^ imul(previous ^ (previous >>> 30), 0x0019660d)) +
        (source[j] | 0) +
        (j | 0)) |
      0
    i = (i + 1) | 0
    ++j
    if ((i | 0) > 623) {
      data[0] = data[623]
      i = 1
    }
    if (j >= sourceLength) {
      j = 0
    }
  }

  for (k = 623; (k | 0) > 0; --k) {
    data[i] = previous =
      ((data[i] ^ imul(previous ^ (previous >>> 30), 0x5d588b65)) - i) | 0
    i = (i + 1) | 0
    if ((i | 0) > 623) {
      data[0] = data[623]
      i = 1
    }
  }

  data[0] = 0x80000000
}

function mt19937(): MT19937Engine {
  const data = new Int32Array(624)
  let index = 0

  const next = ((): number => {
    if ((index | 0) >= 624) {
      refreshData(data)
      index = 0
    }

    const value = data[index]
    index = (index + 1) | 0
    return temper(value) | 0
  }) as MT19937Engine

  next.discard = (count: number): MT19937Engine => {
    if ((index | 0) >= 624) {
      refreshData(data)
      index = 0
    }
    while (count - index > 624) {
      count -= 624 - index
      refreshData(data)
      index = 0
    }
    index = (index + count) | 0
    return next
  }

  next.seed = (initial: number): MT19937Engine => {
    let previous = 0
    data[0] = previous = initial | 0

    for (let i = 1; i < 624; i = (i + 1) | 0) {
      data[i] = previous = (imul(previous ^ (previous >>> 30), 0x6c078965) + i) | 0
    }
    index = 624
    return next
  }

  next.seedWithArray = (source: number[]): MT19937Engine => {
    next.seed(0x012bd6aa)
    seedDataWithArray(data, source)
    return next
  }

  next.autoSeed = (): MT19937Engine => next.seedWithArray(Random.generateEntropyArray())

  return next
}

const nativeMath: Engine = () => (Math.random() * 0x100000000) | 0

// -- distribution helpers --------------------------------------------------

function returnValue(value: number): Engine {
  return () => value
}

function add(
  generate: (engine: Engine) => number,
  addend: number,
): (engine: Engine) => number {
  if (addend === 0) {
    return generate
  }
  return (engine: Engine) => generate(engine) + addend
}

function isPowerOfTwoMinusOne(value: number): boolean {
  return ((value + 1) & value) === 0
}

function bitmask(masking: number): (engine: Engine) => number {
  return (engine: Engine) => engine() & masking
}

function downscaleToLoopCheckedRange(range: number): (engine: Engine) => number {
  const extendedRange = range + 1
  const maximum = extendedRange * Math.floor(0x100000000 / extendedRange)
  return (engine: Engine) => {
    let value = 0
    do {
      value = engine() >>> 0
    } while (value >= maximum)
    return value % extendedRange
  }
}

function downscaleToRange(range: number): (engine: Engine) => number {
  return isPowerOfTwoMinusOne(range) ? bitmask(range) : downscaleToLoopCheckedRange(range)
}

function isEvenlyDivisibleByMaxInt32(value: number): boolean {
  return (value | 0) === 0
}

function upscaleWithHighMasking(masking: number): (engine: Engine) => number {
  return (engine: Engine) => {
    const high = engine() & masking
    const low = engine() >>> 0
    return high * 0x100000000 + low
  }
}

function upscaleToLoopCheckedRange(extendedRange: number): (engine: Engine) => number {
  const maximum = extendedRange * Math.floor(0x20000000000000 / extendedRange)
  return (engine: Engine) => {
    let ret = 0
    do {
      const high = engine() & 0x1fffff
      const low = engine() >>> 0
      ret = high * 0x100000000 + low
    } while (ret >= maximum)
    return ret % extendedRange
  }
}

function upscaleWithinU53(range: number): (engine: Engine) => number {
  const extendedRange = range + 1
  if (isEvenlyDivisibleByMaxInt32(extendedRange)) {
    const highRange = ((extendedRange / 0x100000000) | 0) - 1
    if (isPowerOfTwoMinusOne(highRange)) {
      return upscaleWithHighMasking(highRange)
    }
  }
  return upscaleToLoopCheckedRange(extendedRange)
}

function upscaleWithinI53AndLoopCheck(
  min: number,
  max: number,
): (engine: Engine) => number {
  return (engine: Engine) => {
    let ret = 0
    do {
      const high = engine() | 0
      const low = engine() >>> 0
      ret =
        (high & 0x1fffff) * 0x100000000 + low + (high & 0x200000 ? -0x20000000000000 : 0)
    } while (ret < min || ret > max)
    return ret
  }
}

export class Random {
  readonly engine: Engine

  constructor(engine?: Engine | null) {
    if (engine == null) {
      engine = Random.engines.nativeMath
    } else if (typeof engine !== 'function') {
      throw new TypeError('Expected engine to be a function, got ' + typeof engine)
    }
    this.engine = engine
  }

  static engines = { nativeMath, mt19937 }

  static generateEntropyArray(): number[] {
    const array: number[] = []
    array.push(new Date().getTime() | 0)
    const engine = Random.engines.nativeMath
    for (let i = 0; i < 16; ++i) {
      array[i] = engine() | 0
    }
    return array
  }

  /** [-0x80000000, 0x7fffffff] */
  static int32(this: void, engine: Engine): number {
    return engine() | 0
  }

  /** [0, 0xffffffff] */
  static uint32(this: void, engine: Engine): number {
    return engine() >>> 0
  }

  /** [0, 0x1fffffffffffff] */
  static uint53(this: void, engine: Engine): number {
    const high = engine() & 0x1fffff
    const low = engine() >>> 0
    return high * 0x100000000 + low
  }

  /** [0, 0x20000000000000] */
  static uint53Full(this: void, engine: Engine): number {
    for (;;) {
      const high = engine() | 0
      if (high & 0x200000) {
        if ((high & 0x3fffff) === 0x200000 && (engine() | 0) === 0) {
          return 0x20000000000000
        }
      } else {
        const low = engine() >>> 0
        return (high & 0x1fffff) * 0x100000000 + low
      }
    }
  }

  /** [-0x20000000000000, 0x1fffffffffffff] */
  static int53(this: void, engine: Engine): number {
    const high = engine() | 0
    const low = engine() >>> 0
    return (
      (high & 0x1fffff) * 0x100000000 + low + (high & 0x200000 ? -0x20000000000000 : 0)
    )
  }

  /** [-0x20000000000000, 0x20000000000000] */
  static int53Full(this: void, engine: Engine): number {
    for (;;) {
      const high = engine() | 0
      if (high & 0x400000) {
        if ((high & 0x7fffff) === 0x400000 && (engine() | 0) === 0) {
          return 0x20000000000000
        }
      } else {
        const low = engine() >>> 0
        return (
          (high & 0x1fffff) * 0x100000000 +
          low +
          (high & 0x200000 ? -0x20000000000000 : 0)
        )
      }
    }
  }

  static integer(this: void, min: number, max: number): (engine: Engine) => number {
    min = Math.floor(min)
    max = Math.floor(max)
    if (min < -0x20000000000000 || !isFinite(min)) {
      throw new RangeError('Expected min to be at least ' + -0x20000000000000)
    } else if (max > 0x20000000000000 || !isFinite(max)) {
      throw new RangeError('Expected max to be at most ' + 0x20000000000000)
    }

    const range = max - min
    if (range <= 0 || !isFinite(range)) {
      return returnValue(min)
    } else if (range === 0xffffffff) {
      return min === 0 ? Random.uint32 : add(Random.int32, min + 0x80000000)
    } else if (range < 0xffffffff) {
      return add(downscaleToRange(range), min)
    } else if (range === 0x1fffffffffffff) {
      return add(Random.uint53, min)
    } else if (range < 0x1fffffffffffff) {
      return add(upscaleWithinU53(range), min)
    } else if (max - 1 - min === 0x1fffffffffffff) {
      return add(Random.uint53Full, min)
    } else if (min === -0x20000000000000 && max === 0x20000000000000) {
      return Random.int53Full
    } else if (min === -0x20000000000000 && max === 0x1fffffffffffff) {
      return Random.int53
    } else if (min === -0x1fffffffffffff && max === 0x20000000000000) {
      return add(Random.int53, 1)
    } else if (max === 0x20000000000000) {
      return add(upscaleWithinI53AndLoopCheck(min - 1, max - 1), 1)
    } else {
      return upscaleWithinI53AndLoopCheck(min, max)
    }
  }

  /** [0, 1) (floating point) */
  static realZeroToOneExclusive(this: void, engine: Engine): number {
    return Random.uint53(engine) / 0x20000000000000
  }

  int32(): number {
    return Random.int32(this.engine)
  }

  uint32(): number {
    return Random.uint32(this.engine)
  }

  uint53(): number {
    return Random.uint53(this.engine)
  }

  uint53Full(): number {
    return Random.uint53Full(this.engine)
  }

  int53(): number {
    return Random.int53(this.engine)
  }

  int53Full(): number {
    return Random.int53Full(this.engine)
  }

  integer(min: number, max: number): number {
    return Random.integer(min, max)(this.engine)
  }

  realZeroToOneExclusive(): number {
    return Random.realZeroToOneExclusive(this.engine)
  }
}
