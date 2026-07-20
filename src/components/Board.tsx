import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { fileOf, rankOf, type Position } from '../engine/types'

const ZEN_DIGITS = ['９', '８', '７', '６', '５', '４', '３', '２', '１']
const KANJI_RANKS = ['一', '二', '三', '四', '五', '六', '七', '八', '九']

/** 駒の表示文字 (成香などは1文字の略字) */
export const PIECE_CHARS: Record<number, string> = {
  1: '歩', 2: '香', 3: '桂', 4: '銀', 5: '金', 6: '角', 7: '飛', 8: '玉',
  9: 'と', 10: '杏', 11: '圭', 12: '全', 14: '馬', 15: '龍',
}

const PIECE_NAMES: Record<number, string> = {
  1: '歩', 2: '香車', 3: '桂馬', 4: '銀将', 5: '金将', 6: '角行', 7: '飛車', 8: '玉将',
  9: 'と金', 10: '成香', 11: '成桂', 12: '成銀', 14: '馬', 15: '龍',
}
const ZEN_FILES = ['', '１', '２', '３', '４', '５', '６', '７', '８', '９']

const PIECE_ASSET_NAMES: Record<number, string> = {
  1: 'pawn',
  2: 'lance',
  3: 'knight',
  4: 'silver',
  5: 'gold',
  6: 'bishop',
  7: 'rook',
  9: 'prom_pawn',
  10: 'prom_lance',
  11: 'prom_knight',
  12: 'prom_silver',
  14: 'horse',
  15: 'dragon',
}

const SHOGI_ASSET_ROOT = `${import.meta.env.BASE_URL}assets/shogi`
const BOARD_IMAGE = `${SHOGI_ASSET_ROOT}/board-light.png`

/**
 * Shogi Images の一文字駒。盤反転時も手前側の駒が正位置になる画像を選ぶ。
 * 王将は後手、玉将は先手に割り当てて両者を区別する。
 */
function pieceImage(piece: number, flipped = false, inHand = false): string {
  const abs = Math.abs(piece)
  const name = abs === 8 ? (piece > 0 ? 'king2' : 'king') : PIECE_ASSET_NAMES[abs]
  const side = inHand || !(piece < 0 !== flipped) ? 'black' : 'white'
  return `${SHOGI_ASSET_ROOT}/${side}_${name}.png`
}

interface BoardProps {
  position: Position
  /** 直前の指し手の移動先 (ハイライト用)。なければ -1 */
  lastTo: number
  selected: number // 選択中のマス。なければ -1
  targets: ReadonlySet<number>
  flipped: boolean
  /** 解析による最善手 (移動元・先を矢印で表示)。from が -1 なら駒打ち */
  bestMove?: { from: number; to: number } | null
  interactive: boolean
  onSquareClick: (sq: number) => void
}

export function boardSquareLabel(
  position: Position,
  sq: number,
  state: {
    selected: boolean
    target: boolean
    last: boolean
    bestFrom: boolean
    bestTo: boolean
  },
): string {
  const p = position.board[sq]
  const coordinate = `${ZEN_FILES[fileOf(sq)]}${KANJI_RANKS[rankOf(sq) - 1]}`
  const content = p === 0 ? '空き' : `${p > 0 ? '先手' : '後手'}の${PIECE_NAMES[Math.abs(p)]}`
  const descriptions = [
    state.selected ? '選択中' : '',
    state.target ? '移動可能' : '',
    state.last ? '直前手' : '',
    state.bestFrom ? '最善手の移動元' : '',
    state.bestTo ? '最善手の移動先' : '',
  ].filter(Boolean)
  return `${coordinate} ${content}${descriptions.length > 0 ? ` ${descriptions.join(' ')}` : ''}`
}

export function nextBoardSquare(sq: number, key: string, flipped: boolean): number {
  const display = flipped ? 80 - sq : sq
  const row = Math.floor(display / 9)
  const col = display % 9
  let next = display
  if (key === 'ArrowLeft' && col > 0) next--
  else if (key === 'ArrowRight' && col < 8) next++
  else if (key === 'ArrowUp' && row > 0) next -= 9
  else if (key === 'ArrowDown' && row < 8) next += 9
  else if (key === 'Home') next = row * 9
  else if (key === 'End') next = row * 9 + 8
  return flipped ? 80 - next : next
}

export function Board({ position, lastTo, selected, targets, flipped, bestMove, interactive, onSquareClick }: BoardProps) {
  // 表示順: 通常は sq 0..80 (9筋→1筋, 1段→9段)。反転時は逆順
  const order = Array.from({ length: 81 }, (_, i) => (flipped ? 80 - i : i))
  const files = flipped ? [...ZEN_DIGITS].reverse() : ZEN_DIGITS
  const ranks = flipped ? [...KANJI_RANKS].reverse() : KANJI_RANKS
  const [focusedSquare, setFocusedSquare] = useState(flipped ? 80 : 0)
  const cellRefs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => setFocusedSquare(flipped ? 80 : 0), [flipped])

  const onCellKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>, sq: number): void => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
      event.preventDefault()
      event.stopPropagation()
      const next = nextBoardSquare(sq, event.key, flipped)
      setFocusedSquare(next)
      cellRefs.current[next]?.focus()
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      event.stopPropagation()
      onSquareClick(sq)
    }
  }

  return (
    <div className="board-wrap">
      <p id="board-keyboard-help" className="sr-only">
        矢印キーで盤上を移動し、EnterまたはSpaceで駒の選択と着手を行います。HomeとEndで同じ段の端へ移動します。
      </p>
      <div className="coords-top" aria-hidden="true">
        {files.map((f) => (
          <span key={f}>{f}</span>
        ))}
      </div>
      <div className="board-row">
        <div
          className="board"
          role="grid"
          aria-label="将棋盤"
          aria-describedby="board-keyboard-help"
          aria-rowcount={9}
          aria-colcount={9}
          aria-disabled={!interactive}
          style={{ backgroundImage: `url(${BOARD_IMAGE})` }}
        >
          {order.map((sq) => {
            const p = position.board[sq]
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
            const display = flipped ? 80 - sq : sq
            const ariaState = {
              selected: sq === selected,
              target: targets.has(sq),
              last: sq === lastTo,
              bestFrom: !!bestMove && sq === bestMove.from,
              bestTo: !!bestMove && sq === bestMove.to,
            }
            return (
              <div
                key={sq}
                ref={(element) => { cellRefs.current[sq] = element }}
                className={cls}
                onClick={() => onSquareClick(sq)}
                onFocus={() => setFocusedSquare(sq)}
                onKeyDown={(event) => onCellKeyDown(event, sq)}
                role="gridcell"
                tabIndex={sq === focusedSquare ? 0 : -1}
                aria-label={boardSquareLabel(position, sq, ariaState)}
                aria-rowindex={Math.floor(display / 9) + 1}
                aria-colindex={(display % 9) + 1}
                aria-selected={ariaState.selected}
              >
                {p !== 0 && (
                  <img
                    className="piece"
                    src={pieceImage(p, flipped)}
                    alt=""
                    aria-hidden="true"
                    draggable={false}
                  />
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
            aria-label={`${owner === 0 ? '先手' : '後手'}の持ち駒 ${PIECE_NAMES[t]} ${hand[t]}枚`}
            aria-pressed={selectedPiece === t}
          >
            <img
              className="piece small"
              src={pieceImage(t, false, true)}
              alt={PIECE_CHARS[t]}
              draggable={false}
            />
            {hand[t] > 1 && <span className="count">×{hand[t]}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}
