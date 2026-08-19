import { describe, expect, it } from 'vite-plus/test'

import fixtures from './prng.fixtures.json' with { type: 'json' }
import { Random } from '../src/payload/random.js'

interface RandomInstance {
  integer(min: number, max: number): number
  realZeroToOneExclusive(): number
}

interface RandomCtor {
  new (engine: unknown): RandomInstance
  engines: {
    mt19937(): {
      seed(n: number): unknown
      seedWithArray(a: number[]): unknown
    }
  }
  generateEntropyArray(): number[]
}

function draws(Random: RandomCtor, seed: number, n: number): number[] {
  const random = new Random(Random.engines.mt19937().seed(seed))
  return Array.from({ length: n }, () => random.integer(0, 999))
}

function reals(Random: RandomCtor, seed: number, n: number): number[] {
  const random = new Random(Random.engines.mt19937().seed(seed))
  return Array.from({ length: n }, () => random.realZeroToOneExclusive())
}

function arrayDraws(Random: RandomCtor, seed: number[], n: number): number[] {
  const random = new Random(Random.engines.mt19937().seedWithArray(seed))
  return Array.from({ length: n }, () => random.integer(0, 999))
}

function checkAgainstFixtures(name: string, Random: RandomCtor): void {
  describe(name, () => {
    it('integer(0, 999) matches the pinned sequence for each seed', () => {
      expect(draws(Random, 0, 20)).toEqual(fixtures.integer_0_999.seed_0)
      expect(draws(Random, 12345, 20)).toEqual(fixtures.integer_0_999.seed_12345)
      expect(draws(Random, -1, 20)).toEqual(fixtures.integer_0_999.seed_neg1)
      expect(draws(Random, 2147483647, 20)).toEqual(
        fixtures.integer_0_999.seed_2147483647,
      )
    })

    it('realZeroToOneExclusive() matches the pinned sequence', () => {
      expect(reals(Random, 12345, 10)).toEqual(fixtures.realZeroToOneExclusive.seed_12345)
    })

    it('seedWithArray() matches the pinned sequence', () => {
      expect(arrayDraws(Random, [1, 2, 3, 4], 20)).toEqual(
        fixtures.seedWithArray.arr_1_2_3_4,
      )
    })

    it('generateEntropyArray() returns the expected length', () => {
      expect(Random.generateEntropyArray()).toHaveLength(fixtures.entropyArrayLength)
    })

    it('is reproducible: the same seed twice gives the same sequence', () => {
      expect(draws(Random, 999, 50)).toEqual(draws(Random, 999, 50))
    })

    it('is seed-sensitive: adjacent seeds diverge', () => {
      expect(draws(Random, 1000, 20)).not.toEqual(draws(Random, 1001, 20))
    })
  })
}

checkAgainstFixtures('PRNG (src/payload/random.ts)', Random as unknown as RandomCtor)
