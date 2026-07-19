import { useRef, useState } from 'react'

const W = 600
const H = 180
const PAD_L = 34
const PAD_R = 10
const PAD_T = 10
const PAD_B = 18
const CLAMP = 2000 // 表示上の評価値クランプ(詰みスコア対策)

interface EvalGraphProps {
  /** 各局面の評価値(先手視点)。未解析は null */
  scores: (number | null)[]
  /** 各指し手の悪手マーク ('?' | '??' | null)。scores.length - 1 個 */
  marks: (string | null)[]
  cursor: number
  /** 指し手の表示テキスト (ツールチップ用)。moveTexts[i] = i+1手目 */
  moveTexts: string[]
  onSeek: (index: number) => void
}

export function EvalGraph({ scores, marks, cursor, moveTexts, onSeek }: EvalGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<number | null>(null)

  const n = scores.length
  if (n < 2) return null

  const x = (i: number): number => PAD_L + ((W - PAD_L - PAD_R) * i) / (n - 1)
  const y = (score: number): number => {
    const clamped = Math.max(-CLAMP, Math.min(CLAMP, score))
    return PAD_T + ((H - PAD_T - PAD_B) * (CLAMP - clamped)) / (2 * CLAMP)
  }

  let path = ''
  for (let i = 0; i < n; i++) {
    const s = scores[i]
    if (s === null) continue
    path += `${path === '' ? 'M' : 'L'}${x(i).toFixed(1)},${y(s).toFixed(1)} `
  }

  const indexFromEvent = (e: { clientX: number }): number => {
    const rect = svgRef.current!.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * W
    const i = Math.round(((px - PAD_L) / (W - PAD_L - PAD_R)) * (n - 1))
    return Math.max(0, Math.min(n - 1, i))
  }

  const hoverScore = hover !== null ? scores[hover] : null
  const fmt = (s: number): string => {
    if (Math.abs(s) > 50000) return s > 0 ? '先手勝勢(詰み)' : '後手勝勢(詰み)'
    return (s > 0 ? '+' : '') + s
  }

  return (
    <div className="evalgraph">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        onPointerMove={(e) => setHover(indexFromEvent(e))}
        onPointerLeave={() => setHover(null)}
        onClick={(e) => onSeek(indexFromEvent(e))}
        role="img"
        aria-label="評価値グラフ(先手視点)"
      >
        {/* 目盛り(控えめなグリッド) */}
        {[-CLAMP, -CLAMP / 2, CLAMP / 2, CLAMP].map((v) => (
          <line key={v} x1={PAD_L} x2={W - PAD_R} y1={y(v)} y2={y(v)} className="grid" />
        ))}
        {/* ゼロ基準線 */}
        <line x1={PAD_L} x2={W - PAD_R} y1={y(0)} y2={y(0)} className="zero" />
        <text x={4} y={y(CLAMP) + 4} className="axis-label">先手</text>
        <text x={4} y={y(-CLAMP) + 4} className="axis-label">後手</text>
        <text x={4} y={y(0) + 4} className="axis-label">0</text>

        {/* 現在位置 */}
        <line x1={x(cursor)} x2={x(cursor)} y1={PAD_T} y2={H - PAD_B} className="cursor-line" />

        {/* 評価値ライン */}
        <path d={path} className="eval-line" vectorEffect="non-scaling-stroke" />

        {/* 悪手・疑問手マーク (moveTexts[i] は i+1 手目 → 局面 i+1 に打点) */}
        {marks.map((mark, i) =>
          mark && scores[i + 1] !== null ? (
            <circle
              key={i}
              cx={x(i + 1)}
              cy={y(scores[i + 1]!)}
              r={mark === '??' ? 5 : 4}
              className={mark === '??' ? 'blunder' : 'dubious'}
            />
          ) : null,
        )}

        {/* ホバー用クロスヘア */}
        {hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1={PAD_T} y2={H - PAD_B} className="crosshair" />
        )}
      </svg>
      {hover !== null && (
        <div className="graph-tooltip">
          {hover === 0 ? '開始局面' : `${hover}手目 ${moveTexts[hover - 1] ?? ''}`}
          {hover > 0 && marks[hover - 1] ? ` ${marks[hover - 1] === '??' ? '【悪手】' : '【疑問手】'}` : ''}
          {' — '}
          {hoverScore !== null ? `評価値 ${fmt(hoverScore)}` : '未解析'}
        </div>
      )}
    </div>
  )
}
