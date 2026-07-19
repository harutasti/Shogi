import type { Position } from '../engine/types'

const ZEN_DIGITS = ['９', '８', '７', '６', '５', '４', '３', '２', '１']
const KANJI_RANKS = ['一', '二', '三', '四', '五', '六', '七', '八', '九']

/** 駒の表示文字 (成香などは1文字の略字) */
export const PIECE_CHARS: Record<number, string> = {
  1: '歩', 2: '香', 3: '桂', 4: '銀', 5: '金', 6: '角', 7: '飛', 8: '玉',
  9: 'と', 10: '杏', 11: '圭', 12: '全', 14: '馬', 15: '龍',
}

interface BoardProps {
  position: Position
  /** 直前の指し手の移動先 (ハイライト用)。なければ -1 */
  lastTo: number
  selected: number // 選択中のマス。なければ -1
  targets: ReadonlySet<number>
  flipped: boolean
  onSquareClick: (sq: number) => void
}

export function Board({ position, lastTo, selected, targets, flipped, onSquareClick }: BoardProps) {
  // 表示順: 通常は sq 0..80 (9筋→1筋, 1段→9段)。反転時は逆順
  const order = Array.from({ length: 81 }, (_, i) => (flipped ? 80 - i : i))
  const files = flipped ? [...ZEN_DIGITS].reverse() : ZEN_DIGITS
  const ranks = flipped ? [...KANJI_RANKS].reverse() : KANJI_RANKS

  return (
    <div className="board-wrap">
      <div className="coords-top" aria-hidden="true">
        {files.map((f) => (
          <span key={f}>{f}</span>
        ))}
      </div>
      <div className="board-row">
        <div className="board" role="grid" aria-label="将棋盤">
          {order.map((sq) => {
            const p = position.board[sq]
            const abs = Math.abs(p)
            const cls = [
              'cell',
              sq === selected ? 'sel' : '',
              targets.has(sq) ? 'target' : '',
              sq === lastTo ? 'last' : '',
            ]
              .filter(Boolean)
              .join(' ')
            return (
              <div key={sq} className={cls} onClick={() => onSquareClick(sq)} role="gridcell">
                {p !== 0 && (
                  <div
                    className={[
                      'piece',
                      p < 0 !== flipped ? 'gote' : '',
                      abs > 8 ? 'promoted' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {PIECE_CHARS[abs]}
                  </div>
                )}
              </div>
            )
          })}
          <div className="hoshi h1" />
          <div className="hoshi h2" />
          <div className="hoshi h3" />
          <div className="hoshi h4" />
        </div>
        <div className="coords-right" aria-hidden="true">
          {ranks.map((r) => (
            <span key={r}>{r}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

const HAND_ORDER = [7, 6, 5, 4, 3, 2, 1] // 飛角金銀桂香歩

interface HandProps {
  position: Position
  owner: 0 | 1
  label: string
  selectedPiece: number // 選択中の持ち駒種。なければ 0
  onPieceClick: (type: number) => void
}

export function HandStand({ position, owner, label, selectedPiece, onPieceClick }: HandProps) {
  const hand = position.hands[owner]
  const chips = HAND_ORDER.filter((t) => hand[t] > 0)
  return (
    <div className={`hand ${owner === 1 ? 'hand-gote' : 'hand-sente'}`}>
      <span className="hand-label">{label}</span>
      <div className="hand-pieces">
        {chips.length === 0 && <span className="hand-empty">なし</span>}
        {chips.map((t) => (
          <button
            key={t}
            className={`chip ${selectedPiece === t ? 'sel' : ''}`}
            onClick={() => onPieceClick(t)}
          >
            <span className={`piece small ${owner === 1 ? 'gote-chip' : ''}`}>{PIECE_CHARS[t]}</span>
            {hand[t] > 1 && <span className="count">×{hand[t]}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}
