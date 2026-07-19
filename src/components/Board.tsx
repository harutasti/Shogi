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
  /** 解析による最善手 (移動元・先を青枠で表示)。from が -1 なら駒打ち */
  bestMove?: { from: number; to: number } | null
  onSquareClick: (sq: number) => void
}

export function Board({ position, lastTo, selected, targets, flipped, bestMove, onSquareClick }: BoardProps) {
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
              bestMove && sq === bestMove.from ? 'best-from' : '',
              bestMove && sq === bestMove.to ? 'best-to' : '',
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
          {bestMove && <BestMoveArrow bestMove={bestMove} flipped={flipped} />}
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

/** 最善手を示す矢印オーバーレイ (駒打ちは移動先の円) */
function BestMoveArrow({
  bestMove,
  flipped,
}: {
  bestMove: { from: number; to: number }
  flipped: boolean
}) {
  const disp = (sq: number): number => (flipped ? 80 - sq : sq)
  const to = disp(bestMove.to)
  const tx = (to % 9) + 0.5
  const ty = ((to / 9) | 0) + 0.5

  if (bestMove.from === -1) {
    return (
      <svg className="best-overlay" viewBox="0 0 9 9" aria-hidden="true">
        <circle cx={tx} cy={ty} r={0.44} className="best-drop" />
      </svg>
    )
  }

  const from = disp(bestMove.from)
  const fx = (from % 9) + 0.5
  const fy = ((from / 9) | 0) + 0.5
  const dx = tx - fx
  const dy = ty - fy
  const len = Math.hypot(dx, dy)
  const ux = dx / len
  const uy = dy / len
  const px = -uy // 矢じり用の垂直方向
  const py = ux
  // 先端はマス中央の少し手前、矢じりの底はそこから 0.38 戻った位置
  const tipX = tx - ux * 0.12
  const tipY = ty - uy * 0.12
  const baseX = tipX - ux * 0.38
  const baseY = tipY - uy * 0.38
  const headPoints = `${tipX},${tipY} ${baseX + px * 0.24},${baseY + py * 0.24} ${baseX - px * 0.24},${baseY - py * 0.24}`

  return (
    <svg className="best-overlay" viewBox="0 0 9 9" aria-hidden="true">
      <line x1={fx} y1={fy} x2={baseX} y2={baseY} className="shaft-halo" />
      <line x1={fx} y1={fy} x2={baseX} y2={baseY} className="shaft" />
      <polygon points={headPoints} className="head" />
    </svg>
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
