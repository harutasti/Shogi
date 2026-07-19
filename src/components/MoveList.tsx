import { useEffect, useRef } from 'react'

interface MoveListProps {
  /** i 手目 (1始まり) の表示テキスト */
  texts: string[]
  marks: (string | null)[]
  scores: (number | null)[]
  cursor: number
  onSeek: (index: number) => void
}

export function MoveList({ texts, marks, scores, cursor, onSeek }: MoveListProps) {
  const listRef = useRef<HTMLOListElement>(null)

  useEffect(() => {
    const el = listRef.current?.querySelector('.current')
    el?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  return (
    <ol className="movelist" ref={listRef}>
      <li className={cursor === 0 ? 'current' : ''} onClick={() => onSeek(0)}>
        <span className="no">-</span>
        <span className="mv">開始局面</span>
      </li>
      {texts.map((t, i) => {
        const score = scores[i + 1]
        return (
          <li key={i} className={cursor === i + 1 ? 'current' : ''} onClick={() => onSeek(i + 1)}>
            <span className="no">{i + 1}</span>
            <span className="mv">
              {t}
              {marks[i] && <em className={`mark ${marks[i] === '??' ? 'bad' : 'dub'}`}>{marks[i]}</em>}
            </span>
            {score !== null && score !== undefined && (
              <span className="score">{score > 0 ? `+${score}` : score}</span>
            )}
          </li>
        )
      })}
    </ol>
  )
}
