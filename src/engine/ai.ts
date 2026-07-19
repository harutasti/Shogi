import { type Move, type Position, OU } from './types'
import { makeMove, unmakeMove } from './position'
import { generateMoves, inCheck } from './movegen'

// ===== 評価関数 =====

/** 盤上の駒の価値 (インデックス = 駒種コード) */
const BOARD_VALUES = [
  0, 90, 315, 405, 495, 540, 855, 990, 0, // 歩 香 桂 銀 金 角 飛 玉
  540, 540, 540, 540, 0, 945, 1305, // と 成香 成桂 成銀 - 馬 龍
]
/** 持ち駒の価値 (打ち込みの自由度があるためやや高め) */
const HAND_VALUES = [0, 100, 350, 450, 550, 600, 950, 1100]

const MATE_SCORE = 100000

/** 局面を先手視点で評価する(正 = 先手有利) */
export function evaluate(pos: Position): number {
  let score = 0
  for (let sq = 0; sq < 81; sq++) {
    const p = pos.board[sq]
    if (p === 0) continue
    const type = Math.abs(p)
    const row = (sq / 9) | 0
    let v = BOARD_VALUES[type]
    // わずかな前進ボーナスで序盤の駒組みを促す(玉は除く)
    if (type !== OU) v += 2 * (p > 0 ? 8 - row : row)
    score += p > 0 ? v : -v
  }
  for (let t = 1; t <= 7; t++) {
    score += HAND_VALUES[t] * (pos.hands[0][t] - pos.hands[1][t])
  }
  return score
}

// ===== 探索 =====

export interface SearchResult {
  /** 最善手 (合法手がなければ null) */
  move: Move | null
  /** 先手視点の評価値 (centipawn 相当)。詰みは ±(MATE_SCORE - 手数) */
  score: number
  depth: number
  nodes: number
}

class TimeoutError extends Error {}

interface SearchContext {
  nodes: number
  deadline: number
}

/** 指し手の並べ替えスコア(大きいほど先に探索) */
function orderScore(m: Move): number {
  let s = 0
  if (m.capture !== 0) s += 10 * BOARD_VALUES[m.capture] - BOARD_VALUES[m.piece]
  if (m.promote) s += 400
  return s
}

function negamax(
  pos: Position,
  depth: number,
  alpha: number,
  beta: number,
  plyFromRoot: number,
  ctx: SearchContext,
): number {
  ctx.nodes++
  if ((ctx.nodes & 1023) === 0 && Date.now() > ctx.deadline) throw new TimeoutError()

  const moves = generateMoves(pos)
  if (moves.length === 0) {
    // 詰み(またはステイルメイト=負け)。浅い詰みを優先するため手数を引く
    return -(MATE_SCORE - plyFromRoot)
  }
  if (depth <= 0) {
    return quiescence(pos, alpha, beta, ctx, 4)
  }

  moves.sort((a, b) => orderScore(b) - orderScore(a))
  let best = -Infinity
  for (const m of moves) {
    makeMove(pos, m)
    const score = -negamax(pos, depth - 1, -beta, -alpha, plyFromRoot + 1, ctx)
    unmakeMove(pos, m)
    if (score > best) best = score
    if (score > alpha) alpha = score
    if (alpha >= beta) break
  }
  return best
}

/** 静止探索: 駒の取り合いだけを読み切って評価を安定させる */
function quiescence(
  pos: Position,
  alpha: number,
  beta: number,
  ctx: SearchContext,
  depth: number,
): number {
  ctx.nodes++
  if ((ctx.nodes & 1023) === 0 && Date.now() > ctx.deadline) throw new TimeoutError()

  const sideSign = pos.turn === 0 ? 1 : -1
  const stand = sideSign * evaluate(pos)
  if (stand >= beta) return stand
  if (stand > alpha) alpha = stand
  if (depth <= 0) return stand

  const captures = generateMoves(pos).filter((m) => m.capture !== 0)
  captures.sort((a, b) => orderScore(b) - orderScore(a))
  let best = stand
  for (const m of captures) {
    makeMove(pos, m)
    const score = -quiescence(pos, -beta, -alpha, ctx, depth - 1)
    unmakeMove(pos, m)
    if (score > best) best = score
    if (score > alpha) alpha = score
    if (alpha >= beta) break
  }
  return best
}

export interface SearchOptions {
  /** 最大探索深さ */
  maxDepth: number
  /** 思考時間の上限 (ms) */
  timeMs: number
  /** 最善手からこの評価値以内の手をランダムに選ぶ(弱さの演出) */
  randomness?: number
}

/** 反復深化 + αβ探索で最善手を求める */
export function searchBestMove(pos: Position, opts: SearchOptions): SearchResult {
  const ctx: SearchContext = { nodes: 0, deadline: Date.now() + opts.timeMs }
  const rootMoves = generateMoves(pos)
  if (rootMoves.length === 0) {
    return { move: null, score: pos.turn === 0 ? -MATE_SCORE : MATE_SCORE, depth: 0, nodes: 0 }
  }

  const sideSign = pos.turn === 0 ? 1 : -1
  let bestScores: { move: Move; score: number }[] = rootMoves.map((m) => ({ move: m, score: 0 }))
  let completedDepth = 0

  for (let depth = 1; depth <= opts.maxDepth; depth++) {
    const scores: { move: Move; score: number }[] = []
    // 前回の反復で良かった順に並べると枝刈りが効く
    const ordered = [...bestScores].sort((a, b) => b.score - a.score).map((x) => x.move)
    try {
      let alpha = -Infinity
      for (const m of ordered) {
        makeMove(pos, m)
        const score = -negamax(pos, depth - 1, -Infinity, -alpha, 1, ctx)
        unmakeMove(pos, m)
        scores.push({ move: m, score })
        if (score > alpha) alpha = score
      }
    } catch (e) {
      if (e instanceof TimeoutError) break
      throw e
    }
    bestScores = scores
    completedDepth = depth
  }

  bestScores.sort((a, b) => b.score - a.score)
  const randomness = opts.randomness ?? 0
  const top = bestScores.filter((x) => x.score >= bestScores[0].score - randomness)
  const chosen = top[Math.floor(Math.random() * top.length)]

  return {
    move: chosen.move,
    score: sideSign * chosen.score, // 先手視点に変換
    depth: completedDepth,
    nodes: ctx.nodes,
  }
}

/** AI レベル → 探索設定 */
export function levelToOptions(level: number): SearchOptions {
  switch (level) {
    case 1:
      return { maxDepth: 1, timeMs: 500, randomness: 350 }
    case 2:
      return { maxDepth: 2, timeMs: 1000, randomness: 120 }
    case 3:
      return { maxDepth: 3, timeMs: 2500, randomness: 0 }
    default:
      return { maxDepth: 5, timeMs: 5000, randomness: 0 }
  }
}

/** 解析用: 局面の評価値(先手視点)と最善手を返す */
export function analyzePosition(pos: Position, timeMs = 1500): SearchResult {
  return searchBestMove(pos, { maxDepth: 4, timeMs, randomness: 0 })
}

export { MATE_SCORE }

/** 手番側が王手されているかも含めた簡易情報(UI表示用) */
export function isInCheck(pos: Position): boolean {
  return inCheck(pos, pos.turn)
}
