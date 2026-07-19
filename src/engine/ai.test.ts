import { describe, expect, it } from 'vitest'
import { searchBestMove } from './ai'
import { parseSfen } from './sfen'
import { makeMove } from './position'
import { getStatus } from './movegen'
import { KI, sqOf } from './types'

describe('AI探索', () => {
  it('1手詰めを見つける(頭金)', () => {
    // 後手玉5一、先手金が持ち駒、5三に歩の支えあり → ５二金打で詰み
    const pos = parseSfen('4k4/9/4P4/9/9/9/9/9/4K4 b G 1')
    const result = searchBestMove(pos, { maxDepth: 2, timeMs: 5000 })
    expect(result.move).not.toBeNull()
    expect(result.move!.from).toBe(-1)
    expect(result.move!.piece).toBe(KI)
    expect(result.move!.to).toBe(sqOf(5, 2))
    makeMove(pos, result.move!)
    expect(getStatus(pos).type).toBe('checkmate')
  })

  it('タダ取りされる手を避けて駒を取る', () => {
    // 先手飛車が後手の浮いた金を取れる局面
    const pos = parseSfen('4k4/9/9/9/4g4/9/9/4R4/4K4 b - 1')
    const result = searchBestMove(pos, { maxDepth: 3, timeMs: 5000 })
    expect(result.move).not.toBeNull()
    expect(result.move!.to).toBe(sqOf(5, 5)) // 金を取る
  })

  it('後手番でも探索できる(スコアは先手視点)', () => {
    // 後手飛車が先手の浮いた金を取れる
    const pos = parseSfen('4k4/4r4/9/9/4G4/9/9/9/4K4 w - 1')
    const result = searchBestMove(pos, { maxDepth: 3, timeMs: 5000 })
    expect(result.move).not.toBeNull()
    expect(result.move!.to).toBe(sqOf(5, 5))
    // 金得なので後手有利 = 負のスコア
    expect(result.score).toBeLessThan(0)
  })
})
