import { type Move, type Position, FU, KY, KE, GI, KI, KA, HI, fileOf, rankOf, sqOf } from './types'
import { generateMoves } from './movegen'

// USI 形式の指し手 (例: 7g7f / 2b3c+ / P*5e)。共有URLの圧縮表現に使う

const USI_PIECE: Record<number, string> = {
  [FU]: 'P', [KY]: 'L', [KE]: 'N', [GI]: 'S', [KI]: 'G', [KA]: 'B', [HI]: 'R',
}
const USI_PIECE_INV: Record<string, number> = {}
for (const [t, c] of Object.entries(USI_PIECE)) USI_PIECE_INV[c] = Number(t)

const sqToUsi = (sq: number): string => `${fileOf(sq)}${'abcdefghi'[rankOf(sq) - 1]}`

export function moveToUsi(m: Move): string {
  if (m.from === -1) return `${USI_PIECE[m.piece]}*${sqToUsi(m.to)}`
  return `${sqToUsi(m.from)}${sqToUsi(m.to)}${m.promote ? '+' : ''}`
}

/** USI 文字列を現局面の合法手と照合して復元する。非合法なら null */
export function usiToMove(pos: Position, usi: string): Move | null {
  const legal = generateMoves(pos)
  if (usi[1] === '*') {
    const piece = USI_PIECE_INV[usi[0]]
    const to = sqOf(Number(usi[2]), 'abcdefghi'.indexOf(usi[3]) + 1)
    return legal.find((m) => m.from === -1 && m.piece === piece && m.to === to) ?? null
  }
  const from = sqOf(Number(usi[0]), 'abcdefghi'.indexOf(usi[1]) + 1)
  const to = sqOf(Number(usi[2]), 'abcdefghi'.indexOf(usi[3]) + 1)
  const promote = usi[4] === '+'
  return legal.find((m) => m.from === from && m.to === to && m.promote === promote) ?? null
}
