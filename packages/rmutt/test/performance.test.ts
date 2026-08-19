import { describe, it } from 'vite-plus/test'

import { transpile } from '../src/index.js'

/** For debugging purposes only. */
describe.skip('performance', () => {
  it('parse nested parens', { timeout: 100 }, async () => {
    await transpile('a:((((((((b))))))));')
  })

  it('parse this rule from math.rm', { timeout: 500 }, async () => {
    const grammar = `add[a,b]:
  zupfx[
   (sum="NaN")
   (ignore=a>"0"%(^sum=b))
   (ignore=b>"0"%(^sum=a))
   (sum>"NaN"%(
     (l = add_d[lsd[a],lsd[b]])
     (m=add[zpfx[msds[a]],zpfx[msds[b]]])
     (ignore=(msds[l] > "1" % ((^m=inc[m]) (^l=l > /1(.)/\\1/))))
     m l))
  ];`
    await transpile(grammar)
  })
})
