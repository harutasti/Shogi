import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Board, HandStand, PIECE_CHARS } from './components/Board'
import { EvalGraph } from './components/EvalGraph'
import { MoveList } from './components/MoveList'
import { type Move, type Player, type Position, opponent, sameMove } from './engine/types'
import { clonePosition, initialPosition, makeMove } from './engine/position'
import { generateMoves, getStatus, inCheck } from './engine/movegen'
import { positionKey, toSfen } from './engine/sfen'
import { exportKif, moveText, parseKif, replayPositions } from './engine/kif'
import { moveToUsi, usiToMove } from './engine/usi'
import type { WorkerResponse } from './ai/worker'

type PlayerKind = 'human' | 1 | 2 | 3 | 4
type ConfirmAction = 'resign' | 'newGame'

export interface GameState {
  moves: Move[]
  /** positions[i] = i手目まで進めた局面 (positions[0] = 初期局面) */
  positions: Position[]
  cursor: number
}

interface AnalysisState {
  scores: (number | null)[]
  bestMoves: (Move | null)[]
  running: boolean
}

const newGameState = (): GameState => ({ moves: [], positions: [initialPosition()], cursor: 0 })
export const restoredGameState = (moves: Move[]): GameState => ({
  moves,
  positions: replayPositions(moves),
  cursor: moves.length,
})

const clearSharedMovesHash = (): void => {
  if (window.location.hash.startsWith('#moves=')) {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
  }
}

const createAiWorker = (): Worker =>
  new Worker(new URL('./ai/worker.ts', import.meta.url), { type: 'module' })

const PLAYER_OPTIONS: { value: string; label: string }[] = [
  { value: 'human', label: 'あなた' },
  { value: '1', label: 'AI 入門' },
  { value: '2', label: 'AI 初級' },
  { value: '3', label: 'AI 中級' },
  { value: '4', label: 'AI 上級' },
]

export default function App() {
  const [game, setGame] = useState<GameState>(newGameState)
  const [players, setPlayers] = useState<Record<Player, PlayerKind>>({ 0: 'human', 1: 2 })
  const [flipped, setFlipped] = useState(false)
  const [selected, setSelected] = useState(-1)
  const [selectedHand, setSelectedHand] = useState(0)
  const [pendingPromo, setPendingPromo] = useState<{ from: number; to: number } | null>(null)
  const [resigned, setResigned] = useState<Player | null>(null)
  const [endNote, setEndNote] = useState<string | null>(null)
  const [thinking, setThinking] = useState(false)
  const [analysis, setAnalysis] = useState<AnalysisState | null>(null)
  const [kifOpen, setKifOpen] = useState(false)
  const [kifText, setKifText] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)

  const playWorkerRef = useRef<Worker | null>(null)
  const analysisWorkerRef = useRef<Worker | null>(null)
  const reqIdRef = useRef(0)
  const pendingSfenRef = useRef('')

  const current = game.positions[game.cursor]
  const live = game.positions[game.positions.length - 1]
  const atLive = game.cursor === game.moves.length
  const liveSfen = toSfen(live)

  // ===== 終局判定 =====
  const result = useMemo(() => {
    if (resigned !== null) {
      return { text: `${resigned === 0 ? '先手' : '後手'}投了`, winner: opponent(resigned) as Player | null }
    }
    const status = getStatus(clonePosition(live))
    if (status.type === 'checkmate') return { text: '詰み', winner: status.winner as Player | null }
    if (status.type === 'stalemate') return { text: '手詰まり', winner: status.winner as Player | null }
    const keys = game.positions.map(positionKey)
    const lastKey = keys[keys.length - 1]
    if (keys.filter((k) => k === lastKey).length >= 4) {
      return { text: '千日手', winner: null as Player | null }
    }
    return null
  }, [game.positions, resigned, live])

  const interactive = players[current.turn] === 'human' && !(atLive && result)

  const legalMoves = useMemo(
    () => (interactive ? generateMoves(clonePosition(current)) : []),
    [current, interactive],
  )

  const targets = useMemo(() => {
    const set = new Set<number>()
    if (selected >= 0) {
      for (const m of legalMoves) if (m.from === selected) set.add(m.to)
    } else if (selectedHand > 0) {
      for (const m of legalMoves) if (m.from === -1 && m.piece === selectedHand) set.add(m.to)
    }
    return set
  }, [legalMoves, selected, selectedHand])

  const clearSelection = useCallback(() => {
    setSelected(-1)
    setSelectedHand(0)
    setPendingPromo(null)
  }, [])

  // ===== 指し手適用 =====
  const applyMove = useCallback((m: Move) => {
    setGame((g) => {
      const base = clonePosition(g.positions[g.cursor])
      makeMove(base, m)
      return {
        moves: [...g.moves.slice(0, g.cursor), m],
        positions: [...g.positions.slice(0, g.cursor + 1), base],
        cursor: g.cursor + 1,
      }
    })
    setAnalysis(null)
    setEndNote(null)
    clearSelection()
  }, [clearSelection])

  // ===== 盤・駒台の操作 =====
  const onSquareClick = (sq: number): void => {
    if (!interactive || pendingPromo) return
    const sign = current.turn === 0 ? 1 : -1
    const p = current.board[sq]
    if (selectedHand > 0) {
      const m = legalMoves.find((x) => x.from === -1 && x.piece === selectedHand && x.to === sq)
      if (m) {
        applyMove(m)
        return
      }
      setSelectedHand(0)
      if (p !== 0 && Math.sign(p) === sign) setSelected(sq)
      return
    }
    if (selected >= 0) {
      const candidates = legalMoves.filter((x) => x.from === selected && x.to === sq)
      if (candidates.length === 1) {
        applyMove(candidates[0])
        return
      }
      if (candidates.length === 2) {
        setPendingPromo({ from: selected, to: sq }) // 成り/不成の選択
        return
      }
      if (sq === selected) {
        setSelected(-1)
        return
      }
    }
    if (p !== 0 && Math.sign(p) === sign) {
      setSelected(sq)
      setSelectedHand(0)
    } else {
      setSelected(-1)
    }
  }

  const onHandClick = (owner: Player, type: number): void => {
    if (!interactive || owner !== current.turn || pendingPromo) return
    setSelected(-1)
    setSelectedHand((prev) => (prev === type ? 0 : type))
  }

  const resolvePromotion = (promote: boolean): void => {
    if (!pendingPromo) return
    const m = legalMoves.find(
      (x) => x.from === pendingPromo.from && x.to === pendingPromo.to && x.promote === promote,
    )
    if (m) applyMove(m)
    else setPendingPromo(null)
  }

  // ===== AI 対局 =====
  useEffect(() => {
    const w = createAiWorker()
    w.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data
      if (msg.type !== 'searchResult') return
      if (msg.id !== reqIdRef.current) return
      setThinking(false)
      const move = msg.move
      if (!move) return
      const forSfen = pendingSfenRef.current
      setGame((g) => {
        const livePos = g.positions[g.positions.length - 1]
        if (toSfen(livePos) !== forSfen) return g // 局面が変わっていたら破棄
        const pos = clonePosition(livePos)
        makeMove(pos, move)
        const wasAtEnd = g.cursor === g.moves.length
        return {
          moves: [...g.moves, move],
          positions: [...g.positions, pos],
          cursor: wasAtEnd ? g.moves.length + 1 : g.cursor,
        }
      })
    }
    playWorkerRef.current = w
    return () => {
      w.terminate()
      playWorkerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (result) {
      setThinking(false)
      return
    }
    const kind = players[live.turn]
    if (kind === 'human') return
    const id = ++reqIdRef.current
    pendingSfenRef.current = liveSfen
    setThinking(true)
    playWorkerRef.current?.postMessage({ type: 'search', id, sfen: liveSfen, level: kind })
  }, [liveSfen, players, result, live.turn])

  // ===== 解析 =====
  const cancelAnalysis = useCallback(() => {
    analysisWorkerRef.current?.terminate()
    analysisWorkerRef.current = null
    setAnalysis((a) => (a ? { ...a, running: false } : a))
  }, [])

  const startAnalysis = (): void => {
    if (game.moves.length === 0) return
    cancelAnalysis()
    const w = createAiWorker()
    const id = ++reqIdRef.current
    w.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data
      if (msg.type === 'analyzeProgress' && msg.id === id) {
        setAnalysis((a) =>
          a
            ? {
                ...a,
                scores: a.scores.map((s, i) => (i === msg.index ? msg.score : s)),
                bestMoves: a.bestMoves.map((b, i) => (i === msg.index ? msg.bestMove : b)),
              }
            : a,
        )
      } else if (msg.type === 'analyzeDone' && msg.id === id) {
        setAnalysis((a) => (a ? { ...a, running: false } : a))
        w.terminate()
        if (analysisWorkerRef.current === w) analysisWorkerRef.current = null
      }
    }
    analysisWorkerRef.current = w
    const sfens = game.positions.map(toSfen)
    setAnalysis({
      scores: Array(sfens.length).fill(null),
      bestMoves: Array(sfens.length).fill(null),
      running: true,
    })
    w.postMessage({ type: 'analyze', id, sfens, timeMsPerPosition: 800 })
  }

  useEffect(() => () => cancelAnalysis(), [cancelAnalysis])

  // ===== 表示用データ =====
  const moveTexts = useMemo(
    () =>
      game.moves.map(
        (m, i) =>
          (i % 2 === 0 ? '▲' : '△') +
          moveText(m, i > 0 ? game.moves[i - 1].to : null, (i % 2) as Player),
      ),
    [game.moves],
  )

  const marks = useMemo(() => {
    if (!analysis) return game.moves.map(() => null as string | null)
    const clamp = (v: number): number => Math.max(-3000, Math.min(3000, v))
    return game.moves.map((_, i) => {
      const before = analysis.scores[i]
      const after = analysis.scores[i + 1]
      if (before === null || after === null) return null
      const loss = i % 2 === 0 ? clamp(after) - clamp(before) : clamp(before) - clamp(after)
      if (loss <= -800) return '??'
      if (loss <= -350) return '?'
      return null
    })
  }, [analysis, game.moves])

  const analyzedCount = analysis ? analysis.scores.filter((s) => s !== null).length : 0

  // 現在表示中の局面の最善手(解析済みの場合)
  const bestMoveNow = analysis?.bestMoves[game.cursor] ?? null
  const bestMoveText = useMemo(() => {
    if (!bestMoveNow) return null
    const prevDest = game.cursor > 0 ? game.moves[game.cursor - 1].to : null
    return (
      (game.positions[game.cursor].turn === 0 ? '▲' : '△') +
      moveText(bestMoveNow, prevDest, game.positions[game.cursor].turn)
    )
  }, [bestMoveNow, game.cursor, game.moves, game.positions])
  const playedIsBest =
    bestMoveNow !== null &&
    game.cursor < game.moves.length &&
    sameMove(game.moves[game.cursor], bestMoveNow)

  // ===== 棋譜の入出力 =====
  const importKifText = (text: string): void => {
    try {
      const parsed = parseKif(text)
      if (parsed.moves.length === 0) throw new Error('指し手が見つかりませんでした')
      setGame(restoredGameState(parsed.moves))
      setPlayers({ 0: 'human', 1: 'human' })
      setResigned(null)
      setEndNote(parsed.endText)
      setAnalysis(null)
      setKifOpen(false)
      setKifText('')
      clearSelection()
      clearSharedMovesHash()
      setToast(`棋譜を読み込みました(全${parsed.moves.length}手)`)
    } catch (e) {
      setToast(`読み込み失敗: ${(e as Error).message}`)
    }
  }

  const downloadKif = (): void => {
    const winner = result?.winner === 0 ? '先手' : result?.winner === 1 ? '後手' : null
    const text = exportKif(game.moves, {
      sente: players[0] === 'human' ? 'あなた' : `AI Lv${players[0]}`,
      gote: players[1] === 'human' ? 'あなた' : `AI Lv${players[1]}`,
      endText: resigned !== null ? '投了' : result ? result.text : endNote ?? '中断',
      winner,
    })
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `shogi_${Date.now()}.kif`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const copyShareUrl = (): void => {
    const url = `${location.origin}${location.pathname}#moves=${game.moves.map(moveToUsi).join('.')}`
    navigator.clipboard
      .writeText(url)
      .then(() => setToast('共有URLをコピーしました'))
      .catch(() => setToast('コピーに失敗しました'))
  }

  // 共有URLからの復元
  useEffect(() => {
    const match = location.hash.match(/#moves=([^&]+)/)
    if (!match) return
    try {
      const pos = initialPosition()
      const moves: Move[] = []
      for (const usi of match[1].split('.')) {
        const mv = usiToMove(pos, usi)
        if (!mv) throw new Error(`共有URLの指し手が不正です: ${usi}`)
        moves.push(mv)
        makeMove(pos, mv)
      }
      setGame(restoredGameState(moves))
      setPlayers({ 0: 'human', 1: 'human' })
      setResigned(null)
      setEndNote(null)
      setAnalysis(null)
      clearSelection()
      setToast(`共有された棋譜を読み込みました(全${moves.length}手)`)
    } catch {
      setToast('共有URLの読み込みに失敗しました')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const resetGame = (): void => {
    reqIdRef.current++ // 思考中のAI応答を無効化
    setGame(newGameState())
    setResigned(null)
    setEndNote(null)
    setAnalysis(null)
    setThinking(false)
    clearSelection()
    clearSharedMovesHash()
  }

  const requestNewGame = (): void => {
    if (game.moves.length > 0 || resigned !== null || endNote !== null) setConfirmAction('newGame')
    else resetGame()
  }

  const confirmDestructiveAction = (): void => {
    if (confirmAction === 'resign') setResigned(live.turn)
    else if (confirmAction === 'newGame') resetGame()
    setConfirmAction(null)
  }

  const seek = (i: number): void => {
    setGame((g) => ({ ...g, cursor: Math.max(0, Math.min(g.moves.length, i)) }))
    clearSelection()
  }

  // 矢印キーで棋譜ナビゲーション
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.target instanceof HTMLElement && e.target.closest('textarea, input, select, button, [role="grid"], [role="dialog"]')) return
      if (e.key === 'ArrowLeft') seek(game.cursor - 1)
      if (e.key === 'ArrowRight') seek(game.cursor + 1)
      if (e.key === 'Home') seek(0)
      if (e.key === 'End') seek(game.moves.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.cursor, game.moves.length])

  useEffect(() => {
    if (toast === null) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  // ===== ステータス表示 =====
  const lastTo = game.cursor > 0 ? game.moves[game.cursor - 1].to : -1
  const checkNow = inCheck(clonePosition(current), current.turn)
  let statusText: string
  if (atLive && result) {
    statusText =
      result.winner !== null
        ? `${result.text} — ${result.winner === 0 ? '先手' : '後手'}の勝ち`
        : `${result.text} — 引き分け`
  } else if (atLive && thinking) {
    statusText = `${live.turn === 0 ? '▲先手' : '△後手'} AI思考中…`
  } else {
    statusText = `${game.cursor}手目 ${current.turn === 0 ? '▲先手番' : '△後手番'}${checkNow ? ' 王手!' : ''}`
    if (!atLive) statusText += ' (検討中: ここから指すと以降の手は破棄されます)'
    else if (endNote) statusText += ` [棋譜: ${endNote}]`
  }

  const topOwner: Player = flipped ? 0 : 1
  const bottomOwner: Player = flipped ? 1 : 0
  const promoPiece = pendingPromo ? Math.abs(current.board[pendingPromo.from]) : 0

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand-mark" aria-hidden="true">王</div>
        <div className="brand-copy">
          <h1>将棋</h1>
          <span className="sub">対局と棋譜解析</span>
        </div>
      </header>

      <div className="layout">
        <section className="board-area">
          <HandStand
            position={current}
            owner={topOwner}
            label={topOwner === 1 ? '☖後手' : '☗先手'}
            selectedPiece={topOwner === current.turn ? selectedHand : 0}
            onPieceClick={(t) => onHandClick(topOwner, t)}
          />
          <div className="board-outer">
            <Board
              position={current}
              lastTo={lastTo}
              selected={selected}
              targets={targets}
              flipped={flipped}
              bestMove={bestMoveNow}
              interactive={interactive}
              onSquareClick={onSquareClick}
            />
            {pendingPromo && (
              <div className="promo-overlay">
                <div className="promo-box">
                  <p>成りますか?</p>
                  <div className="promo-buttons">
                    <button className="primary" onClick={() => resolvePromotion(true)}>
                      <span className="piece small promoted">{PIECE_CHARS[promoPiece + 8]}</span> 成る
                    </button>
                    <button onClick={() => resolvePromotion(false)}>
                      <span className="piece small">{PIECE_CHARS[promoPiece]}</span> 不成
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
          <HandStand
            position={current}
            owner={bottomOwner}
            label={bottomOwner === 0 ? '☗先手' : '☖後手'}
            selectedPiece={bottomOwner === current.turn ? selectedHand : 0}
            onPieceClick={(t) => onHandClick(bottomOwner, t)}
          />
          <div
            className={`statusbar ${atLive && result ? 'over' : ''} ${atLive && thinking ? 'thinking' : ''} ${!atLive ? 'reviewing' : ''}`}
            role="status"
            aria-live="polite"
          >
            <span className="status-dot" aria-hidden="true" />
            <span>{statusText}</span>
          </div>
        </section>

        <aside className="panel">
          <div className="card">
            <div className="card-heading">
              <div>
                <h2>対局</h2>
                <p>先後と対戦相手</p>
              </div>
              <span className="turn-badge">{current.turn === 0 ? '▲ 先手番' : '△ 後手番'}</span>
            </div>
            <div className="row player-row">
              <label>
                ☗先手
                <select
                  value={String(players[0])}
                  onChange={(e) =>
                    setPlayers((p) => ({ ...p, 0: e.target.value === 'human' ? 'human' : (Number(e.target.value) as PlayerKind) }))
                  }
                >
                  {PLAYER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              <label>
                ☖後手
                <select
                  value={String(players[1])}
                  onChange={(e) =>
                    setPlayers((p) => ({ ...p, 1: e.target.value === 'human' ? 'human' : (Number(e.target.value) as PlayerKind) }))
                  }
                >
                  {PLAYER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="row action-row">
              <button className="primary" onClick={requestNewGame}>新規対局</button>
              <button
                onClick={() => setConfirmAction('resign')}
                disabled={!!result || players[live.turn] !== 'human' || game.moves.length === 0}
              >
                投了
              </button>
              <button onClick={() => setFlipped((f) => !f)}>盤反転</button>
            </div>
          </div>

          <div className="card">
            <div className="card-heading">
              <div>
                <h2>棋譜</h2>
                <p>局面の移動・保存・共有</p>
              </div>
            </div>
            <div className="row nav-row">
              <button className="icon-button" aria-label="開始局面へ" title="開始局面へ" onClick={() => seek(0)} disabled={game.cursor === 0}>↤</button>
              <button className="icon-button" aria-label="1手戻る" title="1手戻る" onClick={() => seek(game.cursor - 1)} disabled={game.cursor === 0}>‹</button>
              <span className="nav-pos">{game.cursor} / {game.moves.length}</span>
              <button className="icon-button" aria-label="1手進む" title="1手進む" onClick={() => seek(game.cursor + 1)} disabled={atLive}>›</button>
              <button className="icon-button" aria-label="最終局面へ" title="最終局面へ" onClick={() => seek(game.moves.length)} disabled={atLive}>↦</button>
            </div>
            <MoveList texts={moveTexts} marks={marks} scores={analysis?.scores ?? []} cursor={game.cursor} onSeek={seek} />
            <div className="row utility-row">
              <button onClick={() => setKifOpen(true)}>KIF読込</button>
              <button onClick={downloadKif} disabled={game.moves.length === 0}>KIF保存</button>
              <button onClick={copyShareUrl} disabled={game.moves.length === 0}>URL共有</button>
            </div>
          </div>

          <div className="card">
            <div className="card-heading">
              <div>
                <h2>AI解析</h2>
                <p>評価値と、この局面の最善手</p>
              </div>
            </div>
            <div className="row analysis-actions">
              {analysis?.running ? (
                <button onClick={cancelAnalysis}>解析中止</button>
              ) : (
                <button className="primary" onClick={startAnalysis} disabled={game.moves.length === 0}>
                  棋譜解析
                </button>
              )}
              {analysis && (
                <span className="progress-text">
                  {analysis.running
                    ? `解析中… ${analyzedCount}/${analysis.scores.length}`
                    : `解析済み ${analyzedCount}/${analysis.scores.length}局面`}
                </span>
              )}
            </div>
            {analysis && (
              <p className="best-move">
                この局面の最善手:{' '}
                {bestMoveText ? (
                  <strong>{bestMoveText}</strong>
                ) : analysis.scores[game.cursor] !== null ? (
                  '—(合法手なし)'
                ) : (
                  '解析待ち…'
                )}
                {bestMoveText && <span className="best-hint">(盤上に青矢印で表示)</span>}
                {playedIsBest && <span className="agree">✓ 実戦と一致</span>}
              </p>
            )}
            {analysis && (
              <EvalGraph
                scores={analysis.scores}
                marks={marks}
                cursor={game.cursor}
                moveTexts={moveTexts}
                onSeek={seek}
              />
            )}
            {!analysis && (
              <p className="hint">
                対局後や棋譜読込後に「棋譜解析」を押すと、AIが全局面を評価して
                評価値グラフと悪手(?？)マークを表示します。
              </p>
            )}
          </div>
        </aside>
      </div>

      {kifOpen && (
        <div className="modal-overlay" onClick={() => setKifOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="kif-dialog-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="kif-dialog-title">KIF形式の棋譜を読み込む</h2>
            <p className="hint">将棋ウォーズ・81Dojo などからエクスポートしたKIFを貼り付けるか、ファイルを選択してください(平手のみ対応)。</p>
            <textarea
              value={kifText}
              onChange={(e) => setKifText(e.target.value)}
              placeholder={'手合割：平手\n   1 ７六歩(77)\n   2 ３四歩(33)\n...'}
              rows={10}
            />
            <div className="row">
              <input
                type="file"
                accept=".kif,.kifu,.txt"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  // 将棋ソフトのKIFは Shift_JIS が多い。UTF-8として不正ならSJISで再解釈
                  file.arrayBuffer().then((buf) => {
                    let text: string
                    try {
                      text = new TextDecoder('utf-8', { fatal: true }).decode(buf)
                    } catch {
                      text = new TextDecoder('shift_jis').decode(buf)
                    }
                    importKifText(text)
                  })
                }}
              />
              <button className="primary" onClick={() => importKifText(kifText)} disabled={kifText.trim() === ''}>
                読み込む
              </button>
              <button onClick={() => setKifOpen(false)}>閉じる</button>
            </div>
          </div>
        </div>
      )}

      {confirmAction && (
        <div
          className="modal-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setConfirmAction(null)
          }}
        >
          <div
            className="modal confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            aria-describedby="confirm-dialog-description"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                setConfirmAction(null)
              }
            }}
          >
            <h2 id="confirm-dialog-title">
              {confirmAction === 'resign' ? '投了しますか？' : '新しい対局を始めますか？'}
            </h2>
            <p id="confirm-dialog-description">
              {confirmAction === 'resign'
                ? '投了すると現在の対局が終了し、取り消せません。'
                : `現在の棋譜（${game.moves.length}手）は失われます。必要なら先にKIF保存してください。`}
            </p>
            <div className="row confirm-actions">
              <button autoFocus onClick={() => setConfirmAction(null)}>キャンセル</button>
              <button className="danger" onClick={confirmDestructiveAction}>
                {confirmAction === 'resign' ? '投了する' : '新規対局を始める'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast" role="status" aria-live="polite">{toast}</div>}
    </div>
  )
}
