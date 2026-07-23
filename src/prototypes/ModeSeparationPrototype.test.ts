import { describe, expect, it } from 'vitest'
import {
  prototypeGameFromUsi,
  prototypeKifImportPlacement,
  prototypeVariantFromSearch,
} from './ModeSeparationPrototype'

describe('mode separation prototype routing', () => {
  it('keeps the production app as the default route', () => {
    expect(prototypeVariantFromSearch('')).toBeNull()
    expect(prototypeVariantFromSearch('?variant=A')).toBeNull()
  })

  it('selects A, B, or D and falls back to A', () => {
    expect(prototypeVariantFromSearch('?prototype=mode-separation&variant=B')).toBe('B')
    expect(prototypeVariantFromSearch('?prototype=mode-separation&variant=d')).toBe('D')
    expect(prototypeVariantFromSearch('?prototype=mode-separation&variant=unknown')).toBe('A')
  })
})

describe('shared prototype game fixture', () => {
  it('replays one shared game state for every variant', () => {
    const game = prototypeGameFromUsi(['7g7f', '3c3d', '8h2b+', '3a2b', 'B*4e'])
    expect(game.moves).toHaveLength(5)
    expect(game.positions).toHaveLength(6)
    expect(game.cursor).toBe(5)
    expect(game.positions[3].turn).toBe(1)
  })
})

describe('A mode KIF import placement', () => {
  it('keeps the import entry only in analysis for A', () => {
    expect(prototypeKifImportPlacement('A')).toEqual({
      game: false,
      record: false,
      analysis: true,
    })
  })

  it('keeps the comparison behavior for B and D', () => {
    expect(prototypeKifImportPlacement('B')).toEqual({
      game: true,
      record: true,
      analysis: false,
    })
    expect(prototypeKifImportPlacement('D')).toEqual({
      game: true,
      record: true,
      analysis: false,
    })
  })
})
