import { describe, expect, it } from 'vitest'
import { exportKif, parseKif, replayPositions } from './kif'
import { toSfen } from './sfen'
import { moveToUsi, usiToMove } from './usi'
import { initialPosition, makeMove } from './position'
import type { Move } from './types'

const SAMPLE_KIF = `# ---- テスト棋譜 ----
手合割：平手
先手：テスト先手
後手：テスト後手
手数----指手---------消費時間--
   1 ７六歩(77)   ( 0:00/00:00:00)
   2 ３四歩(33)   ( 0:00/00:00:00)
   3 ２二角成(88) ( 0:00/00:00:00)
   4 同　銀(31)   ( 0:00/00:00:00)
   5 ４五角打     ( 0:00/00:00:00)
   6 投了
まで5手で先手の勝ち
`

describe('KIF', () => {
  it('サンプル棋譜をパースできる', () => {
    const parsed = parseKif(SAMPLE_KIF)
    expect(parsed.moves.length).toBe(5)
    expect(parsed.headers['先手']).toBe('テスト先手')
    expect(parsed.endText).toBe('投了')
    // 3手目は角成 (8八 → 2二)
    expect(parsed.moves[2].promote).toBe(true)
    // 5手目は角打ち
    expect(parsed.moves[4].from).toBe(-1)
  })

  it('エクスポート → 再パースのラウンドトリップ', () => {
    const parsed = parseKif(SAMPLE_KIF)
    const exported = exportKif(parsed.moves, { endText: '投了', winner: '先手' })
    const reparsed = parseKif(exported)
    expect(reparsed.moves).toEqual(parsed.moves)
  })

  it('平手以外の手合割はエラー', () => {
    expect(() => parseKif('手合割：二枚落ち\n')).toThrow(/未対応/)
  })

  it('非合法手はエラー', () => {
    const bad = '手数----指手---------消費時間--\n   1 ５五歩(77)\n'
    expect(() => parseKif(bad)).toThrow(/1手目/)
  })

  it('replayPositions は n+1 局面を返す', () => {
    const parsed = parseKif(SAMPLE_KIF)
    const positions = replayPositions(parsed.moves)
    expect(positions.length).toBe(6)
    expect(positions[0].ply).toBe(1)
    expect(positions[5].turn).toBe(1) // 5手指した後は後手番
  })
})

describe('USI形式の指し手', () => {
  it('ラウンドトリップ(移動・成り・打ち)', () => {
    const parsed = parseKif(SAMPLE_KIF)
    const pos = initialPosition()
    for (const m of parsed.moves) {
      const usi = moveToUsi(m)
      const back = usiToMove(pos, usi)
      expect(back).toEqual(m)
      makeMove(pos, m as Move)
    }
    // 5手目の表記確認: 角打ちは B*4e
    expect(moveToUsi(parsed.moves[4])).toBe('B*4e')
    expect(moveToUsi(parsed.moves[2])).toBe('8h2b+')
  })

  it('sfenが指し手適用後も整合する', () => {
    const parsed = parseKif(SAMPLE_KIF)
    const pos = initialPosition()
    for (const m of parsed.moves) makeMove(pos, m)
    // 先手の持ち駒に角(交換で1枚使って打った)、後手の持ち駒に角はない
    expect(toSfen(pos)).toContain(' w ')
  })
})
