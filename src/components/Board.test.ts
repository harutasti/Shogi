import { describe, expect, it } from 'vitest'
import { initialPosition } from '../engine/position'
import { sqOf } from '../engine/types'
import { boardSquareLabel, nextBoardSquare } from './Board'

describe('board accessibility helpers', () => {
  it('describes coordinates, piece ownership, and interaction state', () => {
    const position = initialPosition()
    expect(boardSquareLabel(position, sqOf(7, 7), {
      selected: true,
      target: false,
      last: false,
      bestFrom: false,
      bestTo: false,
    })).toBe('７七 先手の歩 選択中')
    expect(boardSquareLabel(position, sqOf(9, 1), {
      selected: false,
      target: false,
      last: false,
      bestFrom: false,
      bestTo: false,
    })).toBe('９一 後手の香車')
    expect(boardSquareLabel(position, sqOf(5, 5), {
      selected: false,
      target: true,
      last: false,
      bestFrom: false,
      bestTo: false,
    })).toBe('５五 空き 移動可能')
  })

  it('moves focus in visual order for normal and flipped boards', () => {
    expect(nextBoardSquare(0, 'ArrowRight', false)).toBe(1)
    expect(nextBoardSquare(0, 'ArrowDown', false)).toBe(9)
    expect(nextBoardSquare(0, 'ArrowLeft', false)).toBe(0)
    expect(nextBoardSquare(80, 'ArrowRight', true)).toBe(79)
    expect(nextBoardSquare(80, 'ArrowDown', true)).toBe(71)
  })
})
