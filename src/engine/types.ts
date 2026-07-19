// ===== 基本型定義 =====

/** 0: 先手 (sente/black), 1: 後手 (gote/white) */
export type Player = 0 | 1

// 駒種コード(符号なし)。盤上では先手が正、後手が負の符号付きで持つ。
export const FU = 1 // 歩
export const KY = 2 // 香
export const KE = 3 // 桂
export const GI = 4 // 銀
export const KI = 5 // 金
export const KA = 6 // 角
export const HI = 7 // 飛
export const OU = 8 // 玉

/** 成駒は +8 (と=9, 成香=10, 成桂=11, 成銀=12, 馬=14, 龍=15)。金と玉は成れない */
export const PROMOTE_OFFSET = 8
export const TO = FU + PROMOTE_OFFSET // 9
export const NKY = KY + PROMOTE_OFFSET // 10
export const NKE = KE + PROMOTE_OFFSET // 11
export const NGI = GI + PROMOTE_OFFSET // 12
export const UMA = KA + PROMOTE_OFFSET // 14
export const RYU = HI + PROMOTE_OFFSET // 15

/** 成っているか */
export const isPromoted = (t: number): boolean => t > PROMOTE_OFFSET

/** 成りを外した基本駒種 (と→歩 など)。玉(8)はそのまま */
export const demote = (t: number): number => (t > PROMOTE_OFFSET ? t - PROMOTE_OFFSET : t)

/** 成れる駒種か */
export const canPromoteType = (t: number): boolean =>
  t === FU || t === KY || t === KE || t === GI || t === KA || t === HI

/**
 * マス番号: 0..80。
 * sq = row * 9 + col。row = 段-1 (上から 0..8)、col = 0..8 (左から、9筋→1筋)。
 * つまり筋 file = 9 - col、段 rank = row + 1。SFEN の並び順と一致する。
 */
export const sqOf = (file: number, rank: number): number => (rank - 1) * 9 + (9 - file)
export const fileOf = (sq: number): number => 9 - (sq % 9)
export const rankOf = (sq: number): number => Math.floor(sq / 9) + 1

export interface Move {
  /** 移動元マス。駒打ちは -1 */
  from: number
  /** 移動先マス */
  to: number
  /** 動かす駒種(符号なし・成り前の状態)。打ちの場合は打つ駒種 */
  piece: number
  /** この手で成るか */
  promote: boolean
  /** 取った駒種(符号なし、成駒コードのまま)。なければ 0 */
  capture: number
}

export interface Position {
  /** 81マス。先手の駒は正、後手の駒は負、空きは 0 */
  board: Int8Array
  /** 持ち駒 [先手, 後手]。インデックスは駒種 1..7、値は枚数 */
  hands: [Int8Array, Int8Array]
  /** 手番 */
  turn: Player
  /** 手数 (初期局面は 1) */
  ply: number
}

export const opponent = (p: Player): Player => (p === 0 ? 1 : 0)

/** 指し手の同一性判定 */
export const sameMove = (a: Move, b: Move): boolean =>
  a.from === b.from && a.to === b.to && a.promote === b.promote && a.piece === b.piece
