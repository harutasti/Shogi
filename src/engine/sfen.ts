import {
  type Player,
  type Position,
  FU, KY, KE, GI, KI, KA, HI, OU,
  PROMOTE_OFFSET,
  isPromoted,
} from './types'

// SFEN の駒文字 (大文字=先手)。インデックスは駒種コード
const SFEN_CHARS: Record<number, string> = {
  [FU]: 'P', [KY]: 'L', [KE]: 'N', [GI]: 'S', [KI]: 'G', [KA]: 'B', [HI]: 'R', [OU]: 'K',
}
const CHAR_TO_TYPE: Record<string, number> = {}
for (const [t, c] of Object.entries(SFEN_CHARS)) CHAR_TO_TYPE[c] = Number(t)

/** SFEN 文字列をパースして局面を返す。不正な文字列は Error を投げる */
export function parseSfen(sfen: string): Position {
  const parts = sfen.trim().split(/\s+/)
  if (parts.length < 3) throw new Error(`SFENが不正です: ${sfen}`)
  const [boardPart, turnPart, handsPart, plyPart] = parts

  const board = new Int8Array(81)
  const rows = boardPart.split('/')
  if (rows.length !== 9) throw new Error(`SFENの盤面は9段必要です: ${boardPart}`)
  for (let row = 0; row < 9; row++) {
    let col = 0
    let promoted = false
    for (const ch of rows[row]) {
      if (ch === '+') {
        promoted = true
        continue
      }
      if (/[1-9]/.test(ch)) {
        col += Number(ch)
        continue
      }
      const upper = ch.toUpperCase()
      const type = CHAR_TO_TYPE[upper]
      if (type === undefined || col >= 9) throw new Error(`SFENに不正な駒があります: ${ch}`)
      const sign = ch === upper ? 1 : -1
      board[row * 9 + col] = sign * (promoted ? type + PROMOTE_OFFSET : type)
      promoted = false
      col++
    }
    if (col !== 9) throw new Error(`SFENの${row + 1}段目が9マスになっていません`)
  }

  if (turnPart !== 'b' && turnPart !== 'w') throw new Error(`SFENの手番が不正です: ${turnPart}`)
  const turn: Player = turnPart === 'b' ? 0 : 1

  const hands: [Int8Array, Int8Array] = [new Int8Array(9), new Int8Array(9)]
  if (handsPart !== '-') {
    let count = 0
    for (const ch of handsPart) {
      if (/[0-9]/.test(ch)) {
        count = count * 10 + Number(ch)
        continue
      }
      const upper = ch.toUpperCase()
      const type = CHAR_TO_TYPE[upper]
      if (type === undefined || type === OU) throw new Error(`SFENの持ち駒が不正です: ${ch}`)
      hands[ch === upper ? 0 : 1][type] += count === 0 ? 1 : count
      count = 0
    }
  }

  const ply = plyPart ? Number(plyPart) : 1
  return { board, hands, turn, ply: Number.isFinite(ply) && ply >= 1 ? ply : 1 }
}

/** 局面を SFEN 文字列にする */
export function toSfen(pos: Position): string {
  let boardPart = ''
  for (let row = 0; row < 9; row++) {
    let empty = 0
    for (let col = 0; col < 9; col++) {
      const p = pos.board[row * 9 + col]
      if (p === 0) {
        empty++
        continue
      }
      if (empty > 0) {
        boardPart += empty
        empty = 0
      }
      const abs = Math.abs(p)
      const ch = SFEN_CHARS[isPromoted(abs) ? abs - PROMOTE_OFFSET : abs]
      boardPart += (isPromoted(abs) ? '+' : '') + (p > 0 ? ch : ch.toLowerCase())
    }
    if (empty > 0) boardPart += empty
    if (row < 8) boardPart += '/'
  }

  // 持ち駒は飛角金銀桂香歩の順で書くのが慣例
  const handOrder = [HI, KA, KI, GI, KE, KY, FU]
  let handsPart = ''
  for (const owner of [0, 1] as const) {
    for (const type of handOrder) {
      const n = pos.hands[owner][type]
      if (n === 0) continue
      const ch = SFEN_CHARS[type]
      handsPart += (n > 1 ? n : '') + (owner === 0 ? ch : ch.toLowerCase())
    }
  }
  if (handsPart === '') handsPart = '-'

  return `${boardPart} ${pos.turn === 0 ? 'b' : 'w'} ${handsPart} ${pos.ply}`
}

/** 千日手判定などに使う、手数を除いた局面キー */
export function positionKey(pos: Position): string {
  const s = toSfen(pos)
  return s.slice(0, s.lastIndexOf(' '))
}
