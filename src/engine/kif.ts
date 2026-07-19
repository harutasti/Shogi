import {
  type Move,
  type Position,
  FU, KY, KE, GI, KI, KA, HI, OU,
  TO, NKY, NKE, NGI, UMA, RYU,
  canPromoteType,
  fileOf, rankOf, sqOf,
  sameMove,
} from './types'
import { clonePosition, initialPosition, makeMove } from './position'
import { generateMoves, inPromotionZone } from './movegen'

// ===== 表記テーブル =====

const PIECE_NAMES: Record<number, string> = {
  [FU]: '歩', [KY]: '香', [KE]: '桂', [GI]: '銀', [KI]: '金', [KA]: '角', [HI]: '飛', [OU]: '玉',
  [TO]: 'と', [NKY]: '成香', [NKE]: '成桂', [NGI]: '成銀', [UMA]: '馬', [RYU]: '龍',
}
const NAME_TO_PIECE: Record<string, number> = {}
for (const [t, n] of Object.entries(PIECE_NAMES)) NAME_TO_PIECE[n] = Number(t)
NAME_TO_PIECE['王'] = OU
NAME_TO_PIECE['竜'] = RYU

const ZEN_DIGITS = '１２３４５６７８９'
const KANJI_DIGITS = '一二三四五六七八九'

const parseDigit = (ch: string): number => {
  const zen = ZEN_DIGITS.indexOf(ch)
  if (zen >= 0) return zen + 1
  const kanji = KANJI_DIGITS.indexOf(ch)
  if (kanji >= 0) return kanji + 1
  if (/[1-9]/.test(ch)) return Number(ch)
  return -1
}

/** 指し手の日本語表記 (▲７六歩 など)。UI とKIF出力で共用 */
export function moveText(m: Move, prevDest: number | null, mover?: 0 | 1): string {
  const dest =
    prevDest === m.to
      ? '同　'
      : ZEN_DIGITS[fileOf(m.to) - 1] + KANJI_DIGITS[rankOf(m.to) - 1]
  const name = PIECE_NAMES[m.piece]
  let suffix = ''
  if (m.from === -1) suffix = '打'
  else if (m.promote) suffix = '成'
  else if (
    mover !== undefined &&
    canPromoteType(m.piece) &&
    (inPromotionZone(m.from, mover) || inPromotionZone(m.to, mover))
  ) {
    suffix = '不成' // 成れるのに成らなかった手は明示する(KIF互換)
  }
  return dest + name + suffix
}

export interface ParsedKif {
  headers: Record<string, string>
  moves: Move[]
  /** 投了などの終局表示 (あれば) */
  endText: string | null
}

const END_WORDS = ['投了', '中断', '千日手', '持将棋', '詰み', '切れ負け', '反則勝ち', '反則負け', '入玉勝ち']

/**
 * KIF 形式の棋譜をパースする。
 * 平手のみ対応。各手は合法手と照合しながら復元し、不整合があれば Error を投げる。
 */
export function parseKif(text: string): ParsedKif {
  const headers: Record<string, string> = {}
  const moves: Move[] = []
  let endText: string | null = null

  const pos = initialPosition()
  let prevDest: number | null = null

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith('*') || line.startsWith('#')) continue

    // ヘッダ行 (例: 先手:山田 / 手合割:平手)。全角・半角コロン両対応
    const headerMatch = line.match(/^([^\s:：]+)[:：](.*)$/)
    if (headerMatch && !/^\d/.test(line)) {
      headers[headerMatch[1]] = headerMatch[2].trim()
      continue
    }
    if (line.startsWith('手数')) continue // 区切り行
    if (line.startsWith('まで')) continue // 終局サマリ行

    // 指し手行 (例: "1 ７六歩(77)   ( 0:00/00:00:00)")
    const moveMatch = line.match(/^(\d+)\s+(.+?)(?:\s*\(\s*\d+:\d+.*)?$/)
    if (!moveMatch) continue
    const body = moveMatch[2].trim()

    const endWord = END_WORDS.find((w) => body.startsWith(w))
    if (endWord) {
      endText = endWord
      break
    }

    const move = parseMoveBody(body, pos, prevDest)
    if (move === null) {
      throw new Error(`${moveMatch[1]}手目「${body}」を解釈できません(非合法手の可能性があります)`)
    }
    moves.push(move)
    prevDest = move.to
    makeMove(pos, move)
  }

  if (headers['手合割'] && headers['手合割'] !== '平手') {
    throw new Error(`手合割「${headers['手合割']}」は未対応です(平手のみ対応)`)
  }
  return { headers, moves, endText }
}

/** 1手分のテキストを解釈して合法手と照合する */
function parseMoveBody(body: string, pos: Position, prevDest: number | null): Move | null {
  let rest = body
  let to: number

  if (rest.startsWith('同')) {
    if (prevDest === null) return null
    to = prevDest
    rest = rest.slice(1).replace(/^[\s　]+/, '')
  } else {
    const file = parseDigit(rest[0])
    const rank = parseDigit(rest[1])
    if (file < 0 || rank < 0) return null
    to = sqOf(file, rank)
    rest = rest.slice(2)
  }

  // 駒名 (長い名前から先に照合)
  const name = ['成香', '成桂', '成銀', ...Object.keys(NAME_TO_PIECE)].find((n) => rest.startsWith(n))
  if (!name) return null
  const piece = NAME_TO_PIECE[name]
  rest = rest.slice(name.length)

  const isDrop = rest.startsWith('打')
  const promote = rest.startsWith('成') && !rest.startsWith('成香') // 「成」サフィックスのみ
  const originMatch = rest.match(/\((\d)(\d)\)/)

  const legal = generateMoves(pos)
  let candidates: Move[]
  if (originMatch) {
    const from = sqOf(Number(originMatch[1]), Number(originMatch[2]))
    candidates = legal.filter((m) => m.from === from && m.to === to && m.promote === promote)
  } else if (isDrop) {
    candidates = legal.filter((m) => m.from === -1 && m.piece === piece && m.to === to)
  } else {
    // 出典情報なし: 駒種と行き先で一意に決まる場合のみ受理(盤上の駒を優先)
    candidates = legal.filter((m) => m.piece === piece && m.to === to && m.promote === promote)
    const boardMoves = candidates.filter((m) => m.from !== -1)
    if (boardMoves.length === 1) candidates = boardMoves
  }
  return candidates.length >= 1 ? candidates[0] : null
}

/** 対局を KIF 形式のテキストに書き出す */
export function exportKif(
  moves: Move[],
  options: {
    sente?: string
    gote?: string
    endText?: string | null
    /** 終局理由の勝者表示に使う ("先手" | "後手" | null) */
    winner?: '先手' | '後手' | null
  } = {},
): string {
  const lines: string[] = []
  const now = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  lines.push(`開始日時：${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`)
  lines.push('手合割：平手')
  lines.push(`先手：${options.sente ?? '先手'}`)
  lines.push(`後手：${options.gote ?? '後手'}`)
  lines.push('手数----指手---------消費時間--')

  let prevDest: number | null = null
  moves.forEach((m, i) => {
    let text = moveText(m, prevDest, (i % 2) as 0 | 1)
    if (m.from !== -1) text += `(${fileOf(m.from)}${rankOf(m.from)})`
    lines.push(`${String(i + 1).padStart(4)} ${text.padEnd(10, '　')} ( 0:00/00:00:00)`)
    prevDest = m.to
  })

  const endText = options.endText ?? '中断'
  lines.push(`${String(moves.length + 1).padStart(4)} ${endText.padEnd(10, '　')} ( 0:00/00:00:00)`)
  if (options.winner) {
    lines.push(`まで${moves.length}手で${options.winner}の勝ち`)
  }
  return lines.join('\n') + '\n'
}

/** 初期局面から指し手列を再生し、各局面(初期局面含む n+1 個)を返す */
export function replayPositions(moves: Move[]): Position[] {
  const positions: Position[] = []
  const pos = initialPosition()
  positions.push(clonePosition(pos))
  for (const m of moves) {
    makeMove(pos, m)
    positions.push(clonePosition(pos))
  }
  return positions
}

/** 合法手照合付きで1手進める(UI用ヘルパ)。非合法なら null */
export function tryMove(pos: Position, m: Move): Move | null {
  const legal = generateMoves(pos)
  return legal.find((x) => sameMove(x, m)) ?? null
}
