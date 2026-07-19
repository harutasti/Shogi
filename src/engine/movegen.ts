import {
  type Move,
  type Player,
  type Position,
  FU, KY, KE, GI, KI, KA, HI, OU,
  TO, NKY, NKE, NGI, UMA, RYU,
  canPromoteType,
  opponent,
} from './types'
import { findKing, makeMove, unmakeMove } from './position'

// 方向は (dc, dr)。dr が負 = 先手から見て前(段が小さくなる方向)。
// 後手は dr を反転して使う(各駒の方向集合は左右対称なので dc はそのままでよい)。
type Delta = readonly [number, number]

const GOLD_STEPS: readonly Delta[] = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [0, 1]]
const KING_STEPS: readonly Delta[] = [
  [-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1],
]
const ORTHO: readonly Delta[] = [[0, -1], [0, 1], [-1, 0], [1, 0]]
const DIAG: readonly Delta[] = [[-1, -1], [1, -1], [-1, 1], [1, 1]]

const STEPS: readonly (readonly Delta[])[] = (() => {
  const t: (readonly Delta[])[] = Array.from({ length: 16 }, () => [])
  t[FU] = [[0, -1]]
  t[KE] = [[-1, -2], [1, -2]]
  t[GI] = [[-1, -1], [0, -1], [1, -1], [-1, 1], [1, 1]]
  t[KI] = GOLD_STEPS
  t[OU] = KING_STEPS
  t[TO] = GOLD_STEPS
  t[NKY] = GOLD_STEPS
  t[NKE] = GOLD_STEPS
  t[NGI] = GOLD_STEPS
  t[UMA] = ORTHO // 角の斜め走りに加えて上下左右1マス
  t[RYU] = DIAG // 飛の縦横走りに加えて斜め1マス
  return t
})()

const SLIDES: readonly (readonly Delta[])[] = (() => {
  const t: (readonly Delta[])[] = Array.from({ length: 16 }, () => [])
  t[KY] = [[0, -1]]
  t[KA] = DIAG
  t[HI] = ORTHO
  t[UMA] = DIAG
  t[RYU] = ORTHO
  return t
})()

/** 敵陣(成れるゾーン)か。先手は 1〜3段目 (row 0..2)、後手は 7〜9段目 */
export const inPromotionZone = (sq: number, player: Player): boolean => {
  const row = (sq / 9) | 0
  return player === 0 ? row <= 2 : row >= 6
}

/** 歩・香がそれ以上進めない最終段か */
const isLastRank = (sq: number, player: Player): boolean => {
  const row = (sq / 9) | 0
  return player === 0 ? row === 0 : row === 8
}

/** 桂が跳べない最終2段か */
const isLastTwoRanks = (sq: number, player: Player): boolean => {
  const row = (sq / 9) | 0
  return player === 0 ? row <= 1 : row >= 7
}

/** player が sq に利きを持っているか */
export function isSquareAttacked(pos: Position, sq: number, by: Player): boolean {
  const board = pos.board
  const col = sq % 9
  const row = (sq / 9) | 0
  const bySign = by === 0 ? 1 : -1
  const mul = by === 0 ? 1 : -1 // 後手の駒の dr 反転用

  // ステップ利き: sq の周囲(桂の跳び元含む)にいる駒が sq へ動けるか
  const stepSources: readonly Delta[] = [
    [-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1],
    [-1, -2], [1, -2], [-1, 2], [1, 2],
  ]
  for (const [dc, dr] of stepSources) {
    const c = col + dc
    const r = row + dr
    if (c < 0 || c > 8 || r < 0 || r > 8) continue
    const p = board[r * 9 + c]
    if (p === 0 || Math.sign(p) !== bySign) continue
    // 攻撃駒から sq への実移動ベクトルは (-dc, -dr)
    const steps = STEPS[Math.abs(p)]
    for (const [sc, sr] of steps) {
      if (sc === -dc && sr * mul === -dr) return true
    }
  }

  // 走り利き: sq から8方向に伸ばして最初にぶつかった駒が、その方向に走れる駒か調べる
  for (const [dc, dr] of KING_STEPS) {
    let c = col + dc
    let r = row + dr
    while (c >= 0 && c <= 8 && r >= 0 && r <= 8) {
      const p = board[r * 9 + c]
      if (p !== 0) {
        if (Math.sign(p) === bySign) {
          const slides = SLIDES[Math.abs(p)]
          for (const [sc, sr] of slides) {
            if (sc === -dc && sr * mul === -dr) return true
          }
        }
        break
      }
      c += dc
      r += dr
    }
  }
  return false
}

/** player の玉に王手がかかっているか */
export function inCheck(pos: Position, player: Player): boolean {
  const king = findKing(pos, player)
  if (king === -1) return false
  return isSquareAttacked(pos, king, opponent(player))
}

interface GenOptions {
  /** 打ち歩詰め判定の再帰時に true(無限再帰防止。詰み逃れ側の打ち歩詰めは無視する) */
  skipUchifuzume?: boolean
  /** 1手見つかった時点で打ち切る(詰み判定用) */
  findOne?: boolean
}

/** 手番側の合法手をすべて生成する */
export function generateMoves(pos: Position, opts: GenOptions = {}): Move[] {
  const moves: Move[] = []
  const turn = pos.turn
  const sign = turn === 0 ? 1 : -1
  const mul = turn === 0 ? 1 : -1
  const board = pos.board

  const pushBoardMove = (from: number, to: number, type: number): void => {
    const capture = Math.abs(board[to])
    const canPromote =
      canPromoteType(type) && (inPromotionZone(from, turn) || inPromotionZone(to, turn))
    const mustPromote =
      ((type === FU || type === KY) && isLastRank(to, turn)) ||
      (type === KE && isLastTwoRanks(to, turn))
    if (canPromote) moves.push({ from, to, piece: type, promote: true, capture })
    if (!mustPromote) moves.push({ from, to, piece: type, promote: false, capture })
  }

  // 盤上の駒の移動
  for (let sq = 0; sq < 81; sq++) {
    const p = board[sq]
    if (p === 0 || Math.sign(p) !== sign) continue
    const type = Math.abs(p)
    const col = sq % 9
    const row = (sq / 9) | 0

    for (const [dc, dr] of STEPS[type]) {
      const c = col + dc
      const r = row + dr * mul
      if (c < 0 || c > 8 || r < 0 || r > 8) continue
      const target = board[r * 9 + c]
      if (target !== 0 && Math.sign(target) === sign) continue
      pushBoardMove(sq, r * 9 + c, type)
    }
    for (const [dc, dr] of SLIDES[type]) {
      let c = col + dc
      let r = row + dr * mul
      while (c >= 0 && c <= 8 && r >= 0 && r <= 8) {
        const target = board[r * 9 + c]
        if (target !== 0 && Math.sign(target) === sign) break
        pushBoardMove(sq, r * 9 + c, type)
        if (target !== 0) break
        c += dc
        r += dr * mul
      }
    }
  }

  // 駒打ち
  const hand = pos.hands[turn]
  // 二歩チェック用: 自分の生歩がある筋
  const pawnCols = new Set<number>()
  if (hand[FU] > 0) {
    for (let sq = 0; sq < 81; sq++) {
      if (board[sq] === sign * FU) pawnCols.add(sq % 9)
    }
  }
  for (let type = FU; type <= HI; type++) {
    if (hand[type] === 0) continue
    for (let sq = 0; sq < 81; sq++) {
      if (board[sq] !== 0) continue
      if (type === FU && (pawnCols.has(sq % 9) || isLastRank(sq, turn))) continue
      if (type === KY && isLastRank(sq, turn)) continue
      if (type === KE && isLastTwoRanks(sq, turn)) continue
      moves.push({ from: -1, to: sq, piece: type, promote: false, capture: 0 })
    }
  }

  // 合法性フィルタ: 王手放置と打ち歩詰めを除外
  const legal: Move[] = []
  const opp = opponent(turn)
  for (const m of moves) {
    makeMove(pos, m)
    let ok = !inCheck(pos, turn)
    if (ok && !opts.skipUchifuzume && m.from === -1 && m.piece === FU && inCheck(pos, opp)) {
      // 歩打ちで王手 → 相手に応手がなければ打ち歩詰めで反則
      if (!hasAnyLegalMove(pos)) ok = false
    }
    unmakeMove(pos, m)
    if (ok) {
      legal.push(m)
      if (opts.findOne) return legal
    }
  }
  return legal
}

/** 手番側に合法手が1手でもあるか(打ち歩詰め判定は省略して再帰を打ち切る) */
export function hasAnyLegalMove(pos: Position): boolean {
  return generateMoves(pos, { skipUchifuzume: true, findOne: true }).length > 0
}

export type GameStatus =
  | { type: 'playing'; check: boolean }
  | { type: 'checkmate'; winner: Player } // 詰み(手番側の負け)
  | { type: 'stalemate'; winner: Player } // 合法手なし(将棋では手番側の負け)

/** 現局面の対局状態を判定する */
export function getStatus(pos: Position): GameStatus {
  const check = inCheck(pos, pos.turn)
  if (generateMoves(pos, { findOne: true }).length === 0) {
    return check
      ? { type: 'checkmate', winner: opponent(pos.turn) }
      : { type: 'stalemate', winner: opponent(pos.turn) }
  }
  return { type: 'playing', check }
}
