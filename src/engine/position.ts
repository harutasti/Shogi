import {
  type Move,
  type Player,
  type Position,
  PROMOTE_OFFSET,
  demote,
} from './types'
import { parseSfen } from './sfen'

/** SFEN 表記の平手初期局面 */
export const INITIAL_SFEN = 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1'

/** 平手初期局面を生成する */
export function initialPosition(): Position {
  return parseSfen(INITIAL_SFEN)
}

/** 局面の複製 */
export function clonePosition(pos: Position): Position {
  return {
    board: new Int8Array(pos.board),
    hands: [new Int8Array(pos.hands[0]), new Int8Array(pos.hands[1])],
    turn: pos.turn,
    ply: pos.ply,
  }
}

/**
 * 指し手を適用する(破壊的)。unmakeMove で戻せる。
 * 合法性は検査しない — 合法手生成側の責務。
 */
export function makeMove(pos: Position, m: Move): void {
  const sign = pos.turn === 0 ? 1 : -1
  if (m.from === -1) {
    // 駒打ち
    pos.hands[pos.turn][m.piece]--
    pos.board[m.to] = sign * m.piece
  } else {
    const captured = pos.board[m.to]
    if (captured !== 0) {
      // 取った駒は成りを外して持ち駒に
      pos.hands[pos.turn][demote(Math.abs(captured))]++
    }
    pos.board[m.from] = 0
    pos.board[m.to] = sign * (m.promote ? m.piece + PROMOTE_OFFSET : m.piece)
  }
  pos.turn = pos.turn === 0 ? 1 : 0
  pos.ply++
}

/** makeMove の逆操作(破壊的) */
export function unmakeMove(pos: Position, m: Move): void {
  pos.ply--
  pos.turn = pos.turn === 0 ? 1 : 0
  const sign = pos.turn === 0 ? 1 : -1
  if (m.from === -1) {
    pos.board[m.to] = 0
    pos.hands[pos.turn][m.piece]++
  } else {
    pos.board[m.from] = sign * m.piece
    pos.board[m.to] = m.capture !== 0 ? -sign * m.capture : 0
    if (m.capture !== 0) {
      pos.hands[pos.turn][demote(m.capture)]--
    }
  }
}

/** player の玉のマスを返す(見つからなければ -1) */
export function findKing(pos: Position, player: Player): number {
  const target = player === 0 ? 8 : -8
  for (let sq = 0; sq < 81; sq++) {
    if (pos.board[sq] === target) return sq
  }
  return -1
}
