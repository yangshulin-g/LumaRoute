import { describe, expect, it } from 'vitest'
import { mediaKeys } from './query-keys'

describe('mediaKeys', () => {
  it('isolates identical item queries by logical server', () => {
    const query = { libraryId: 'lib', startIndex: 0, limit: 60, kinds: ['movie'] as const }
    expect(mediaKeys.items('profile-1', query)).not.toEqual(mediaKeys.items('profile-2', query))
  })
})
