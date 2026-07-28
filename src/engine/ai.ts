import {
  type Move,
  type Player,
  type Position,
  FU,
  GI,
  KI,
  KA,
  HI,
  OU,
  TO,
  NKY,
  NKE,
  NGI,
  UMA,
  RYU,
  fileOf,
  rankOf,
  sameMove,
} from './types'
import { findKing, makeMove, unmakeMove } from './position'
import { generateMoves, inCheck } from './movegen'
import { positionKey } from './sfen'

// ===== 評価関数 =====

/** 盤上の駒の価値 (インデックス = 駒種コード) */
const BOARD_VALUES = [
  0, 90, 315, 405, 495, 540, 855, 990, 0, // 歩 香 桂 銀 金 角 飛 玉
  540, 540, 540, 540, 0, 945, 1305, // と 成香 成桂 成銀 - 馬 龍
]
/** 持ち駒の価値 (打ち込みの自由度があるためやや高め) */
const HAND_VALUES = [0, 100, 350, 450, 550, 600, 950, 1100]

const MATE_SCORE = 100000
const MAX_TRANSPOSITION_ENTRIES = 100000

const ADVANCEMENT_WEIGHTS = [
  0, 8, 2, 4, 4, 1, 0, 0, 0,
  2, 2, 2, 2, 0, 1, 1,
]

const BISHOP_DIRECTIONS = [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const
const ROOK_DIRECTIONS = [[0, -1], [0, 1], [-1, 0], [1, 0]] as const

function slidingMobility(pos: Position, square: number, directions: readonly (readonly [number, number])[]): number {
  const sign = Math.sign(pos.board[square])
  const row = Math.floor(square / 9)
  const col = square % 9
  let mobility = 0
  for (const [dc, dr] of directions) {
    let nextCol = col + dc
    let nextRow = row + dr
    while (nextCol >= 0 && nextCol < 9 && nextRow >= 0 && nextRow < 9) {
      const target = pos.board[nextRow * 9 + nextCol]
      if (target !== 0 && Math.sign(target) === sign) break
      mobility++
      if (target !== 0) break
      nextCol += dc
      nextRow += dr
    }
  }
  return mobility
}

function positionalValue(pos: Position, square: number, piece: number): number {
  const type = Math.abs(piece)
  const owner: Player = piece > 0 ? 0 : 1
  const progress = owner === 0 ? 9 - rankOf(square) : rankOf(square) - 1
  let value = ADVANCEMENT_WEIGHTS[type] * progress

  if (type === KA || type === UMA) value += slidingMobility(pos, square, BISHOP_DIRECTIONS) * 2
  if (type === HI || type === RYU) {
    value += slidingMobility(pos, square, ROOK_DIRECTIONS) * 2
    const file = fileOf(square)
    if (file === 2 || file === 8) value += 18
    else if (file === 1 || file === 9) value -= 18
  }
  return value
}

function kingSafety(pos: Position, player: Player): number {
  const king = findKing(pos, player)
  if (king < 0) return 0
  const sign = player === 0 ? 1 : -1
  const kingRow = Math.floor(king / 9)
  const kingCol = king % 9
  let safety = 0

  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue
      const row = kingRow + dr
      const col = kingCol + dc
      if (row < 0 || row >= 9 || col < 0 || col >= 9) continue
      const piece = pos.board[row * 9 + col]
      if (piece === 0 || Math.sign(piece) !== sign) continue
      const type = Math.abs(piece)
      safety += type === KI || type === GI || type === TO || type === NKY || type === NKE || type === NGI
        ? 14
        : type === FU
          ? 8
          : 5
    }
  }

  const rank = rankOf(king)
  if ((player === 0 && rank === 9) || (player === 1 && rank === 1)) safety += 30
  else if ((player === 0 && rank === 8) || (player === 1 && rank === 2)) safety += 8
  const file = fileOf(king)
  if (file <= 3 || file >= 7) safety += 6
  return safety
}

/** 局面を先手視点で評価する(正 = 先手有利) */
export function evaluate(pos: Position): number {
  let score = 0
  for (let sq = 0; sq < 81; sq++) {
    const p = pos.board[sq]
    if (p === 0) continue
    const type = Math.abs(p)
    let v = BOARD_VALUES[type]
    if (type !== OU) v += positionalValue(pos, sq, p)
    score += p > 0 ? v : -v
  }
  for (let t = 1; t <= 7; t++) {
    score += HAND_VALUES[t] * (pos.hands[0][t] - pos.hands[1][t])
  }
  score += kingSafety(pos, 0) - kingSafety(pos, 1)
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
  /** 置換表から再利用できた局面数 */
  ttHits: number
  /** 静止探索で王手をstand-patせず、合法応手を読んだ回数 */
  qCheckEvasions: number
}

class TimeoutError extends Error {}

interface SearchContext {
  nodes: number
  deadline: number
  ttHits: number
  qCheckEvasions: number
  table: Map<string, TranspositionEntry>
  useTranspositionTable: boolean
}

type TranspositionBound = 'exact' | 'lower' | 'upper'

interface TranspositionEntry {
  depth: number
  score: number
  bound: TranspositionBound
  bestMove: Move | null
}

/** 指し手の並べ替えスコア(大きいほど先に探索) */
function orderScore(m: Move, preferred: Move | null = null): number {
  let s = 0
  if (preferred && sameMove(m, preferred)) s += 1000000
  if (m.capture !== 0) s += 10 * BOARD_VALUES[m.capture] - BOARD_VALUES[m.piece]
  if (m.promote) s += 400
  if (m.from === -1) s += 20
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
  if ((ctx.nodes & 255) === 0 && Date.now() > ctx.deadline) throw new TimeoutError()

  const originalAlpha = alpha
  const originalBeta = beta
  const key = ctx.useTranspositionTable ? positionKey(pos) : ''
  const cached = key ? ctx.table.get(key) : undefined
  if (cached && cached.depth >= depth) {
    ctx.ttHits++
    if (cached.bound === 'exact') return cached.score
    if (cached.bound === 'lower') alpha = Math.max(alpha, cached.score)
    else beta = Math.min(beta, cached.score)
    if (alpha >= beta) return cached.score
  }

  const moves = generateMoves(pos)
  if (moves.length === 0) {
    // 詰み(またはステイルメイト=負け)。浅い詰みを優先するため手数を引く
    return -(MATE_SCORE - plyFromRoot)
  }
  if (depth <= 0) {
    return quiescence(pos, alpha, beta, ctx, 4)
  }

  moves.sort((a, b) => orderScore(b, cached?.bestMove ?? null) - orderScore(a, cached?.bestMove ?? null))
  let best = -Infinity
  let bestMove: Move | null = null
  for (const m of moves) {
    makeMove(pos, m)
    let score: number
    try {
      score = -negamax(pos, depth - 1, -beta, -alpha, plyFromRoot + 1, ctx)
    } finally {
      unmakeMove(pos, m)
    }
    if (score > best) {
      best = score
      bestMove = m
    }
    if (score > alpha) alpha = score
    if (alpha >= beta) break
  }

  if (
    key &&
    ctx.table.size < MAX_TRANSPOSITION_ENTRIES &&
    Math.abs(best) < MATE_SCORE - 512
  ) {
    const bound: TranspositionBound = best <= originalAlpha
      ? 'upper'
      : best >= originalBeta
        ? 'lower'
        : 'exact'
    ctx.table.set(key, { depth, score: best, bound, bestMove })
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
  qply = 0,
): number {
  ctx.nodes++
  if ((ctx.nodes & 255) === 0 && Date.now() > ctx.deadline) throw new TimeoutError()

  const sideSign = pos.turn === 0 ? 1 : -1
  const stand = sideSign * evaluate(pos)
  const checked = inCheck(pos, pos.turn)
  if (checked) ctx.qCheckEvasions++
  const moves = generateMoves(pos)
  if (moves.length === 0) return -(MATE_SCORE - qply)

  if (!checked) {
    if (stand >= beta) return stand
    if (stand > alpha) alpha = stand
    if (depth <= 0) return stand
  } else if (qply >= 8) {
    // 王手中はstand-patできない。連続王手で静止探索が膨張する場合だけ安全弁で打ち切る。
    return stand
  }

  const candidates = checked ? moves : moves.filter((m) => m.capture !== 0)
  candidates.sort((a, b) => orderScore(b) - orderScore(a))
  let best = checked ? -Infinity : stand
  for (const m of candidates) {
    makeMove(pos, m)
    let score: number
    try {
      score = -quiescence(pos, -beta, -alpha, ctx, depth - 1, qply + 1)
    } finally {
      unmakeMove(pos, m)
    }
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
  /** テストで選択を再現するための乱数源 */
  randomSource?: () => number
  /** 同一局面の再探索を省く置換表。既定は有効 */
  useTranspositionTable?: boolean
}

/** 反復深化 + αβ探索で最善手を求める */
export function searchBestMove(pos: Position, opts: SearchOptions): SearchResult {
  const ctx: SearchContext = {
    nodes: 0,
    deadline: Date.now() + opts.timeMs,
    ttHits: 0,
    qCheckEvasions: 0,
    table: new Map(),
    useTranspositionTable: opts.useTranspositionTable !== false,
  }
  const rootMoves = generateMoves(pos)
  if (rootMoves.length === 0) {
    return {
      move: null,
      score: pos.turn === 0 ? -MATE_SCORE : MATE_SCORE,
      depth: 0,
      nodes: 0,
      ttHits: 0,
      qCheckEvasions: 0,
    }
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
        let score: number
        try {
          score = -negamax(pos, depth - 1, -Infinity, -alpha, 1, ctx)
        } finally {
          unmakeMove(pos, m)
        }
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
  let chosen = bestScores[0]
  if (randomness > 0) {
    const top = bestScores.filter((x) => x.score >= bestScores[0].score - randomness)
    const random = opts.randomSource?.() ?? Math.random()
    const index = Math.min(top.length - 1, Math.floor(Math.max(0, random) * top.length))
    chosen = top[index]
  }

  return {
    move: chosen.move,
    score: sideSign * chosen.score, // 先手視点に変換
    depth: completedDepth,
    nodes: ctx.nodes,
    ttHits: ctx.ttHits,
    qCheckEvasions: ctx.qCheckEvasions,
  }
}

/** AI レベル → 探索設定 */
export function levelToOptions(level: number): SearchOptions {
  switch (level) {
    case 1:
      return { maxDepth: 1, timeMs: 500, randomness: 350 }
    case 2:
      return { maxDepth: 3, timeMs: 1200, randomness: 0 }
    case 3:
      return { maxDepth: 4, timeMs: 2500, randomness: 0 }
    default:
      return { maxDepth: 5, timeMs: 5000, randomness: 0 }
  }
}

export function analysisOptions(timeMs = 1200): SearchOptions {
  return { maxDepth: 5, timeMs, randomness: 0, useTranspositionTable: true }
}

/** 解析用: 局面の評価値(先手視点)と最善手を返す */
export function analyzePosition(pos: Position, timeMs = 1200): SearchResult {
  return searchBestMove(pos, analysisOptions(timeMs))
}

export { MATE_SCORE }

/** 手番側が王手されているかも含めた簡易情報(UI表示用) */
export function isInCheck(pos: Position): boolean {
  return inCheck(pos, pos.turn)
}
