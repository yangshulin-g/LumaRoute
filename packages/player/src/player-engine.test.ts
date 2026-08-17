import { expectTypeOf, it } from 'vitest'
import type { PlayerEngine } from './player-engine'

it('publishes an implementation-independent player contract', () => {
  expectTypeOf<PlayerEngine['seek']>().parameters.toEqualTypeOf<[number]>()
  expectTypeOf<PlayerEngine['stop']>().returns.toEqualTypeOf<Promise<void>>()
})
