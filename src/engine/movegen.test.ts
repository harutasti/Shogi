import { describe, expect, it } from 'vitest'
import { generateMoves, getStatus, inCheck } from './movegen'
import { initialPosition, makeMove, unmakeMove } from './position'
import { parseSfen, toSfen } from './sfen'
import { type Position, FU, KI, sqOf } from './types'

/** 合法手数を深さ depth まで数える(perft) */
function perft(pos: Position, depth: number): number {
  if (depth === 0) return 1
  const moves = generateMoves(pos)
  if (depth === 1) return moves.length
  let count = 0
  for (const m of moves) {
    makeMove(pos, m)
    count += perft(pos, depth - 1)
    unmakeMove(pos, m)
  }
  return count
}

describe('perft(既知の合法手数と一致するか)', () => {
  it('平手初期局面: depth 1 = 30', () => {
    expect(perft(initialPosition(), 1)).toBe(30)
  })
  it('平手初期局面: depth 2 = 900', () => {
    expect(perft(initialPosition(), 2)).toBe(900)
  })
  it('平手初期局面: depth 3 = 25470', () => {
    expect(perft(initialPosition(), 3)).toBe(25470)
  })
  it('平手初期局面: depth 4 = 719731', { timeout: 120_000 }, () => {
    expect(perft(initialPosition(), 4)).toBe(719731)
  })
})

describe('SFEN', () => {
  it('初期局面のラウンドトリップ', () => {
    const sfen = 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1'
    expect(toSfen(parseSfen(sfen))).toBe(sfen)
  })
  it('持ち駒・成駒ありのラウンドトリップ', () => {
    const sfen = 'l+R5nl/4kg3/2ns1p1pp/p1pp2p2/9/2P2PPP1/PP1PP4/2G1K2+b1/LNS2G1NL w 2GSb2p 42'
    expect(toSfen(parseSfen(sfen))).toBe(sfen)
  })
})

describe('将棋特有ルール', () => {
  it('二歩は生成されない', () => {
    // 先手が歩を持ち、5筋に既に先手の生歩がある局面
    const pos = parseSfen('4k4/9/9/9/9/4P4/9/9/4K4 b P 1')
    const drops = generateMoves(pos).filter((m) => m.from === -1 && m.piece === FU)
    expect(drops.some((m) => m.to % 9 === 4)).toBe(false)
    // 他の筋には打てる
    expect(drops.some((m) => m.to % 9 === 3)).toBe(true)
  })

  it('と金がある筋には歩を打てる(二歩ではない)', () => {
    const pos = parseSfen('4k4/9/9/9/9/4+P4/9/9/4K4 b P 1')
    const drops = generateMoves(pos).filter((m) => m.from === -1 && m.piece === FU)
    expect(drops.some((m) => m.to % 9 === 4)).toBe(true)
  })

  it('歩・香は1段目、桂は1・2段目に打てない/進めない', () => {
    const pos = parseSfen('9/9/9/4k4/9/9/9/4K4/9 b PLN 1')
    const moves = generateMoves(pos)
    for (const m of moves.filter((x) => x.from === -1)) {
      const row = (m.to / 9) | 0
      if (m.piece === 1 || m.piece === 2) expect(row).toBeGreaterThan(0) // 歩香
      if (m.piece === 3) expect(row).toBeGreaterThan(1) // 桂
    }
  })

  it('歩が敵陣最終段へ進む手は成りが強制される', () => {
    // 先手の歩が5二にいて5一へ進むと最終段
    const pos = parseSfen('3k5/4P4/9/9/9/9/9/9/4K4 b - 1')
    const pawnMoves = generateMoves(pos).filter((m) => m.piece === FU && m.from !== -1)
    expect(pawnMoves.length).toBe(1)
    expect(pawnMoves[0].promote).toBe(true)
  })

  it('敵陣3段目への進入で成り/不成の両方が生成される', () => {
    const pos = parseSfen('4k4/9/9/4P4/9/9/9/9/4K4 b - 1')
    const pawnMoves = generateMoves(pos).filter((m) => m.piece === FU && m.from !== -1)
    expect(pawnMoves.length).toBe(2)
    expect(pawnMoves.some((m) => m.promote)).toBe(true)
    expect(pawnMoves.some((m) => !m.promote)).toBe(true)
  })

  it('王手放置は生成されない', () => {
    // 後手飛車が先手玉を直射。玉を動かすか合駒するしかない
    const pos = parseSfen('4r4/9/9/9/9/9/9/9/4K4 b G 1')
    const moves = generateMoves(pos)
    for (const m of moves) {
      makeMove(pos, m)
      expect(inCheck(pos, 0)).toBe(false)
      unmakeMove(pos, m)
    }
    // 金の合駒(玉の前に打つ)が含まれる
    expect(moves.some((m) => m.from === -1 && m.piece === KI)).toBe(true)
  })

  it('打ち歩詰めは反則として除外される', () => {
    // 後手玉1一。先手の金2三が1二を、桂3三が2一をカバーしており、
    // 1二への歩打ちは詰み = 打ち歩詰めとなるため生成されない
    const pos = parseSfen('8k/9/6NG1/9/9/9/9/9/4K4 b P 1')
    const moves = generateMoves(pos)
    const dropPawn12 = moves.find((m) => m.from === -1 && m.piece === FU && m.to === sqOf(1, 2))
    expect(dropPawn12).toBeUndefined()
    // 詰みにならない歩打ち(例: 1三)は合法
    expect(moves.some((m) => m.from === -1 && m.piece === FU && m.to === sqOf(1, 3))).toBe(true)
  })

  it('突き歩詰めは合法', () => {
    // 同じ詰み形でも、盤上の歩(1三)を突いての詰みは合法
    const pos = parseSfen('8k/9/6NGP/9/9/9/9/9/4K4 b - 1')
    const moves = generateMoves(pos)
    const pushPawn = moves.find(
      (m) => m.piece === FU && m.from === sqOf(1, 3) && m.to === sqOf(1, 2) && !m.promote,
    )
    expect(pushPawn).toBeDefined()
    if (pushPawn) {
      makeMove(pos, pushPawn)
      expect(getStatus(pos).type).toBe('checkmate')
    }
  })
})

describe('詰み判定', () => {
  it('頭金の詰み', () => {
    // 後手玉5一、先手金5二打ち済み、金には5三の歩の紐付き
    const pos = parseSfen('4k4/4G4/4P4/9/9/9/9/9/4K4 w - 1')
    const status = getStatus(pos)
    expect(status.type).toBe('checkmate')
    if (status.type === 'checkmate') expect(status.winner).toBe(0)
  })

  it('詰んでいない王手は playing/check', () => {
    const pos = parseSfen('4k4/4G4/9/9/9/9/9/9/4K4 w - 1')
    const status = getStatus(pos)
    expect(status).toEqual({ type: 'playing', check: true })
  })
})
