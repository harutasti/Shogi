import { describe, expect, it } from 'vitest'
import { initialPosition, makeMove } from './engine/position'
import { usiToMove } from './engine/usi'
import { restoredGameState } from './App'

describe('restoredGameState', () => {
  it('opens an imported or shared game at its final position', () => {
    const position = initialPosition()
    const first = usiToMove(position, '7g7f')
    expect(first).not.toBeNull()
    makeMove(position, first!)
    const second = usiToMove(position, '3c3d')
    expect(second).not.toBeNull()

    const state = restoredGameState([first!, second!])
    expect(state.cursor).toBe(2)
    expect(state.positions).toHaveLength(3)
    expect(state.positions[state.cursor].turn).toBe(0)
  })
})
