import { useMemo, useState } from 'react'
import { Board } from '../components/Board'
import { EvalGraph } from '../components/EvalGraph'
import { MoveList } from '../components/MoveList'
import { generateMoves } from '../engine/movegen'
import { moveText, parseKif, replayPositions } from '../engine/kif'
import { clonePosition, initialPosition, makeMove } from '../engine/position'
import type { Move, Position } from '../engine/types'
import { usiToMove } from '../engine/usi'
import './mode-separation.css'

export type PrototypeVariant = 'A' | 'B' | 'D'
type WorkspaceMode = 'game' | 'analysis'

interface PrototypeGame {
  moves: Move[]
  positions: Position[]
  cursor: number
}

const SAMPLE_KIF = `# ---- UX Discovery テスト棋譜 ----
手合割：平手
先手：テスト先手
後手：テスト後手
手数----指手---------消費時間--
   1 ７六歩(77)   ( 0:00/00:00:00)
   2 ３四歩(33)   ( 0:00/00:00:00)
   3 ２二角成(88) ( 0:00/00:00:00)
   4 同　銀(31)   ( 0:00/00:00:00)
   5 ４五角打     ( 0:00/00:00:00)
   6 投了
まで5手で先手の勝ち`

const SCORE_PATTERN = [30, 80, 20, 260, 140, 430]

const emptyGame = (): PrototypeGame => ({
  moves: [],
  positions: [initialPosition()],
  cursor: 0,
})

export function prototypeVariantFromSearch(search: string): PrototypeVariant | null {
  const params = new URLSearchParams(search)
  if (params.get('prototype') !== 'mode-separation') return null
  const variant = params.get('variant')?.toUpperCase()
  return variant === 'A' || variant === 'B' || variant === 'D' ? variant : 'A'
}

export function prototypeGameFromUsi(usiMoves: string[]): PrototypeGame {
  const position = initialPosition()
  const moves: Move[] = []
  for (const usi of usiMoves) {
    const move = usiToMove(position, usi)
    if (!move) throw new Error(`プロトタイプの指し手が不正です: ${usi}`)
    moves.push(move)
    makeMove(position, move)
  }
  return { moves, positions: replayPositions(moves), cursor: moves.length }
}

function scoresForGame(game: PrototypeGame, analyzed: boolean): (number | null)[] {
  if (!analyzed) return Array(game.positions.length).fill(null)
  return game.positions.map((_, index) => SCORE_PATTERN[index] ?? SCORE_PATTERN[SCORE_PATTERN.length - 1])
}

interface ModeSeparationPrototypeProps {
  initialVariant: PrototypeVariant
}

export function ModeSeparationPrototype({ initialVariant }: ModeSeparationPrototypeProps) {
  const [variant, setVariant] = useState<PrototypeVariant>(initialVariant)
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('game')
  const [game, setGame] = useState<PrototypeGame>(emptyGame)
  const [gameStarted, setGameStarted] = useState(false)
  const [selected, setSelected] = useState(-1)
  const [analysisDone, setAnalysisDone] = useState(false)
  const [analysisSheetOpen, setAnalysisSheetOpen] = useState(false)
  const [kifOpen, setKifOpen] = useState(false)
  const [kifText, setKifText] = useState(SAMPLE_KIF)
  const [toast, setToast] = useState<string | null>(null)

  const current = game.positions[game.cursor]
  const legalMoves = useMemo(
    () => (gameStarted ? generateMoves(clonePosition(current)) : []),
    [current, gameStarted],
  )
  const targets = useMemo(() => {
    const result = new Set<number>()
    if (selected >= 0) {
      for (const move of legalMoves) if (move.from === selected) result.add(move.to)
    }
    return result
  }, [legalMoves, selected])

  const moveTexts = useMemo(
    () => game.moves.map((move, index) => {
      const previousTo = index > 0 ? game.moves[index - 1].to : null
      return `${index % 2 === 0 ? '▲' : '△'}${moveText(move, previousTo, (index % 2) as 0 | 1)}`
    }),
    [game.moves],
  )
  const scores = useMemo(() => scoresForGame(game, analysisDone), [game, analysisDone])
  const marks = useMemo(
    () => game.moves.map((_, index) => (analysisDone && index === 2 ? '?' : null)),
    [analysisDone, game.moves],
  )
  const bestMove = useMemo(
    () => (analysisDone ? generateMoves(clonePosition(current))[0] ?? null : null),
    [analysisDone, current],
  )
  const bestMoveLabel = useMemo(() => {
    if (!bestMove) return null
    const previousTo = game.cursor > 0 ? game.moves[game.cursor - 1].to : null
    return `${current.turn === 0 ? '▲' : '△'}${moveText(bestMove, previousTo, current.turn)}`
  }, [bestMove, current.turn, game.cursor, game.moves])

  const announce = (message: string): void => {
    setToast(message)
    window.setTimeout(() => setToast((currentToast) => (currentToast === message ? null : currentToast)), 2400)
  }

  const changeVariant = (next: PrototypeVariant): void => {
    setVariant(next)
    const url = new URL(window.location.href)
    url.searchParams.set('prototype', 'mode-separation')
    url.searchParams.set('variant', next)
    window.history.replaceState(null, '', url)
    announce(`比較案 ${next} に切り替えました。局面と棋譜は保持されています`)
  }

  const moveVariantFocus = (currentVariant: PrototypeVariant, direction: -1 | 1): void => {
    const variants: PrototypeVariant[] = ['A', 'B', 'D']
    const currentIndex = variants.indexOf(currentVariant)
    const next = variants[(currentIndex + direction + variants.length) % variants.length]
    changeVariant(next)
    window.requestAnimationFrame(() => document.getElementById(`prototype-tab-${next}`)?.focus())
  }

  const beginGame = (): void => {
    setGame(emptyGame())
    setGameStarted(true)
    setSelected(-1)
    setAnalysisDone(false)
    setWorkspaceMode('game')
    setAnalysisSheetOpen(false)
    announce('新しい対局を開始しました')
  }

  const applyHumanMove = (move: Move): void => {
    const baseMoves = [...game.moves.slice(0, game.cursor), move]
    const afterHuman = replayPositions(baseMoves)
    const responsePosition = clonePosition(afterHuman[afterHuman.length - 1])
    const response = usiToMove(responsePosition, '3c3d') ?? generateMoves(responsePosition)[0] ?? null
    const moves = response ? [...baseMoves, response] : baseMoves
    setGame({ moves, positions: replayPositions(moves), cursor: moves.length })
    setSelected(-1)
    setAnalysisDone(false)
    announce(response ? '着手しました。AIが応手しました' : '着手しました')
  }

  const onSquareClick = (square: number): void => {
    if (!gameStarted) {
      announce('先に「新しい対局」を開始してください')
      return
    }
    if (selected >= 0) {
      const move = legalMoves.find((candidate) => candidate.from === selected && candidate.to === square)
      if (move) {
        applyHumanMove(move)
        return
      }
    }
    const piece = current.board[square]
    const ownPiece = piece !== 0 && Math.sign(piece) === (current.turn === 0 ? 1 : -1)
    setSelected(ownPiece ? square : -1)
  }

  const seek = (cursor: number): void => {
    setGame((previous) => ({ ...previous, cursor: Math.max(0, Math.min(previous.moves.length, cursor)) }))
    setSelected(-1)
  }

  const importSampleKif = (): void => {
    try {
      const parsed = parseKif(kifText)
      setGame({ moves: parsed.moves, positions: replayPositions(parsed.moves), cursor: parsed.moves.length })
      setGameStarted(true)
      setSelected(-1)
      setAnalysisDone(false)
      setKifOpen(false)
      announce(`5手の棋譜を読み込みました`)
    } catch (error) {
      announce(`読み込みに失敗しました: ${(error as Error).message}`)
    }
  }

  const runAnalysis = (): void => {
    if (game.moves.length === 0) {
      announce('着手またはKIF読込のあとに解析できます')
      return
    }
    setAnalysisDone(true)
    setWorkspaceMode('analysis')
    if (variant === 'B') setAnalysisSheetOpen(true)
    announce(`${game.cursor}手目まで解析しました`)
  }

  const copyShareUrl = (): void => {
    const shareUrl = `${window.location.origin}${window.location.pathname}?prototype=mode-separation&variant=${variant}#sample-game`
    if (navigator.clipboard?.writeText) void navigator.clipboard.writeText(shareUrl)
    announce('共有URLをコピーしました')
  }

  const resetExperiment = (): void => {
    setGame(emptyGame())
    setGameStarted(false)
    setSelected(-1)
    setAnalysisDone(false)
    setWorkspaceMode('game')
    setAnalysisSheetOpen(false)
    setKifOpen(false)
    announce('実験状態をリセットしました')
  }

  const gamePanel = (
    <GamePanel
      gameStarted={gameStarted}
      moveCount={game.moves.length}
      onBegin={beginGame}
      onOpenKif={() => setKifOpen(true)}
    />
  )
  const recordPanel = (
    <RecordPanel
      game={game}
      moveTexts={moveTexts}
      marks={marks}
      scores={scores}
      onSeek={seek}
      onOpenKif={() => setKifOpen(true)}
      onSave={() => announce('KIFの保存場所を確認しました')}
      onShare={copyShareUrl}
    />
  )
  const analysisPanel = (
    <AnalysisPanel
      game={game}
      moveTexts={moveTexts}
      marks={marks}
      scores={scores}
      analysisDone={analysisDone}
      bestMoveLabel={bestMoveLabel}
      onAnalyze={runAnalysis}
      onSeek={seek}
    />
  )

  return (
    <div className={`prototype-shell prototype-variant-${variant.toLowerCase()}`}>
      <header className="prototype-header">
        <div>
          <p className="prototype-eyebrow">UX DISCOVERY · ISSUE #11</p>
          <h1>対局／解析 情報分離ラボ</h1>
          <p>同じ局面とタスクで、3つの構造だけを比較します。</p>
        </div>
        <div className="prototype-header-actions">
          <button type="button" onClick={resetExperiment}>状態をリセット</button>
          <a className="prototype-exit" href={window.location.pathname}>本番画面へ戻る</a>
        </div>
      </header>

      <nav className="prototype-variant-nav" aria-label="比較案">
        <span className="prototype-nav-label">比較案</span>
        <div className="prototype-tabs" role="tablist" aria-label="対局と解析の情報構造">
          {([
            ['A', 'モード切替'],
            ['B', '解析シート'],
            ['D', '情報階層'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              id={`prototype-tab-${key}`}
              type="button"
              role="tab"
              aria-selected={variant === key}
              aria-controls="prototype-workspace"
              tabIndex={variant === key ? 0 : -1}
              onClick={() => changeVariant(key)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowLeft') {
                  event.preventDefault()
                  moveVariantFocus(key, -1)
                } else if (event.key === 'ArrowRight') {
                  event.preventDefault()
                  moveVariantFocus(key, 1)
                } else if (event.key === 'Home') {
                  event.preventDefault()
                  changeVariant('A')
                  window.requestAnimationFrame(() => document.getElementById('prototype-tab-A')?.focus())
                } else if (event.key === 'End') {
                  event.preventDefault()
                  changeVariant('D')
                  window.requestAnimationFrame(() => document.getElementById('prototype-tab-D')?.focus())
                }
              }}
            >
              <span>{key}</span>{label}
            </button>
          ))}
        </div>
        <p className="prototype-state-note" role="status">
          局面・棋譜・解析結果は案を切り替えても保持
        </p>
      </nav>

      {variant === 'A' && (
        <ModeSwitch mode={workspaceMode} onChange={setWorkspaceMode} />
      )}

      <main
        id="prototype-workspace"
        className="prototype-layout"
        role="tabpanel"
        aria-labelledby={`prototype-tab-${variant}`}
      >
        <section className="prototype-board-column" aria-label="共通の盤面">
          <div className="prototype-board-meta">
            <div>
              <span className="prototype-live-dot" aria-hidden="true" />
              {gameStarted ? '対局中' : '開始前'}
            </div>
            <strong>{game.cursor}手目 · {current.turn === 0 ? '先手番' : '後手番'}</strong>
          </div>
          <div className="prototype-board-frame">
            <Board
              position={current}
              lastTo={game.cursor > 0 ? game.moves[game.cursor - 1].to : -1}
              selected={selected}
              targets={targets}
              flipped={false}
              bestMove={bestMove}
              interactive={gameStarted}
              onSquareClick={onSquareClick}
            />
          </div>
          <p className="prototype-board-caption">
            {analysisDone
              ? `解析済み · ${bestMoveLabel ? `この局面の最善手 ${bestMoveLabel}` : '合法手なし'}`
              : gameStarted
                ? '盤面を操作できます。７七の歩を７六へ動かしてください。'
                : '対局条件を確認して、新しい対局を始めてください。'}
          </p>
        </section>

        <aside className="prototype-panel" aria-label={`比較案 ${variant} の操作`}>
          {variant === 'A' && (
            <>
              {workspaceMode === 'game' ? gamePanel : analysisPanel}
              {recordPanel}
            </>
          )}

          {variant === 'B' && (
            <>
              {gamePanel}
              {recordPanel}
              <section className="prototype-analysis-launch card">
                <div>
                  <p className="prototype-kicker">必要なときだけ</p>
                  <h2>解析は別レイヤーで開く</h2>
                  <p>盤と棋譜を残したまま、解析シートを呼び出します。</p>
                </div>
                <button
                  type="button"
                  className="primary"
                  disabled={game.moves.length === 0}
                  onClick={() => setAnalysisSheetOpen(true)}
                >
                  解析シートを開く
                </button>
              </section>
            </>
          )}

          {variant === 'D' && (
            <>
              <section className="prototype-focus-card card">
                <p className="prototype-kicker">次にすること</p>
                <h2>{game.moves.length === 0 ? '対局を始める' : analysisDone ? '結果を確認・共有する' : 'この棋譜を解析する'}</h2>
                <p>
                  {game.moves.length === 0
                    ? '先手はあなた、後手はAI初級です。'
                    : analysisDone
                      ? `${game.cursor}手目の評価と最善手が表示されています。`
                      : `${game.moves.length}手の棋譜があります。盤面を保ったまま解析できます。`}
                </p>
                <div className="prototype-focus-actions">
                  {game.moves.length === 0 ? (
                    <button type="button" className="primary" onClick={beginGame}>新しい対局を始める</button>
                  ) : !analysisDone ? (
                    <button type="button" className="primary" onClick={runAnalysis}>この棋譜を解析する</button>
                  ) : (
                    <button type="button" className="primary" onClick={copyShareUrl}>URLを共有する</button>
                  )}
                  <button type="button" onClick={() => setKifOpen(true)}>KIFを読み込む</button>
                </div>
              </section>
              {analysisDone && analysisPanel}
              <details className="prototype-disclosure card" open={game.moves.length > 0}>
                <summary>棋譜と局面の操作 <span>{game.cursor} / {game.moves.length}</span></summary>
                <div className="prototype-disclosure-content">{recordPanel}</div>
              </details>
              {game.moves.length === 0 && gamePanel}
            </>
          )}
        </aside>
      </main>

      <div className="prototype-mobile-dock" aria-label="主要操作">
        {variant === 'A' && (
          <>
            <button type="button" className={workspaceMode === 'game' ? 'active' : ''} onClick={() => setWorkspaceMode('game')}>対局</button>
            <button type="button" className={workspaceMode === 'analysis' ? 'active' : ''} onClick={() => setWorkspaceMode('analysis')}>解析</button>
          </>
        )}
        {variant === 'B' && (
          <button type="button" className="primary" disabled={game.moves.length === 0} onClick={() => setAnalysisSheetOpen(true)}>解析シートを開く</button>
        )}
        {variant === 'D' && (
          game.moves.length === 0
            ? <button type="button" className="primary" onClick={beginGame}>新しい対局</button>
            : <button type="button" className="primary" onClick={analysisDone ? copyShareUrl : runAnalysis}>{analysisDone ? 'URL共有' : '棋譜解析'}</button>
        )}
      </div>

      {variant === 'B' && analysisSheetOpen && (
        <div className="prototype-sheet-layer">
          <section className="prototype-sheet" role="region" aria-label="AI解析シート">
            <div className="prototype-sheet-handle" aria-hidden="true" />
            <div className="prototype-sheet-heading">
              <div>
                <p className="prototype-kicker">盤と棋譜はそのまま</p>
                <h2>AI解析</h2>
              </div>
              <button type="button" autoFocus aria-label="解析シートを閉じる" onClick={() => setAnalysisSheetOpen(false)}>閉じる</button>
            </div>
            {analysisPanel}
          </section>
        </div>
      )}

      {kifOpen && (
        <div className="modal-overlay" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setKifOpen(false)
        }}>
          <section
            className="modal prototype-kif-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="prototype-kif-title"
            onKeyDown={(event) => {
              if (event.key === 'Escape') setKifOpen(false)
            }}
          >
            <p className="prototype-kicker">共通テストデータ</p>
            <h2 id="prototype-kif-title">5手のKIFを読み込む</h2>
            <p className="hint">全案で同じ棋譜を使います。内容を確認して読み込んでください。</p>
            <textarea autoFocus rows={11} value={kifText} onChange={(event) => setKifText(event.target.value)} />
            <div className="row confirm-actions">
              <button type="button" onClick={() => setKifOpen(false)}>キャンセル</button>
              <button type="button" className="primary" onClick={importSampleKif}>このKIFを読み込む</button>
            </div>
          </section>
        </div>
      )}

      {toast && <div className="toast" role="status" aria-live="polite">{toast}</div>}
    </div>
  )
}

function ModeSwitch({ mode, onChange }: { mode: WorkspaceMode; onChange: (mode: WorkspaceMode) => void }) {
  return (
    <div className="prototype-mode-switch-wrap">
      <div className="prototype-mode-switch" role="group" aria-label="作業モード">
        <button type="button" aria-pressed={mode === 'game'} onClick={() => onChange('game')}>
          <span>対局</span><small>指す・棋譜を見る</small>
        </button>
        <button type="button" aria-pressed={mode === 'analysis'} onClick={() => onChange('analysis')}>
          <span>解析</span><small>評価・最善手を見る</small>
        </button>
      </div>
    </div>
  )
}

function GamePanel({
  gameStarted,
  moveCount,
  onBegin,
  onOpenKif,
}: {
  gameStarted: boolean
  moveCount: number
  onBegin: () => void
  onOpenKif: () => void
}) {
  return (
    <section className="card prototype-game-panel">
      <div className="card-heading">
        <div>
          <p className="prototype-kicker">対局</p>
          <h2>{gameStarted ? `${moveCount}手目まで進行中` : '対局条件を確認'}</h2>
        </div>
        <span className="turn-badge">AI 初級</span>
      </div>
      <div className="prototype-player-summary">
        <div><span>先手</span><strong>あなた</strong></div>
        <span className="prototype-versus">対</span>
        <div><span>後手</span><strong>AI 初級</strong></div>
      </div>
      <div className="prototype-panel-actions">
        <button type="button" className="primary" onClick={onBegin}>新しい対局を始める</button>
        <button type="button" onClick={onOpenKif}>KIFを読み込む</button>
      </div>
    </section>
  )
}

function RecordPanel({
  game,
  moveTexts,
  marks,
  scores,
  onSeek,
  onOpenKif,
  onSave,
  onShare,
}: {
  game: PrototypeGame
  moveTexts: string[]
  marks: (string | null)[]
  scores: (number | null)[]
  onSeek: (cursor: number) => void
  onOpenKif: () => void
  onSave: () => void
  onShare: () => void
}) {
  return (
    <section className="card prototype-record-panel">
      <div className="card-heading">
        <div>
          <p className="prototype-kicker">共通</p>
          <h2>棋譜</h2>
        </div>
        <span className="prototype-count">{game.cursor} / {game.moves.length}</span>
      </div>
      <div className="row nav-row">
        <button type="button" className="icon-button" aria-label="開始局面へ" onClick={() => onSeek(0)} disabled={game.cursor === 0}>↤</button>
        <button type="button" className="icon-button" aria-label="1手戻る" onClick={() => onSeek(game.cursor - 1)} disabled={game.cursor === 0}>‹</button>
        <span className="nav-pos">{game.cursor} / {game.moves.length}</span>
        <button type="button" className="icon-button" aria-label="1手進む" onClick={() => onSeek(game.cursor + 1)} disabled={game.cursor === game.moves.length}>›</button>
        <button type="button" className="icon-button" aria-label="最終局面へ" onClick={() => onSeek(game.moves.length)} disabled={game.cursor === game.moves.length}>↦</button>
      </div>
      <MoveList texts={moveTexts} marks={marks} scores={scores} cursor={game.cursor} onSeek={onSeek} />
      <div className="prototype-utility-grid">
        <button type="button" onClick={onOpenKif}>KIF読込</button>
        <button type="button" disabled={game.moves.length === 0} onClick={onSave}>KIF保存</button>
        <button type="button" disabled={game.moves.length === 0} onClick={onShare}>URL共有</button>
      </div>
    </section>
  )
}

function AnalysisPanel({
  game,
  moveTexts,
  marks,
  scores,
  analysisDone,
  bestMoveLabel,
  onAnalyze,
  onSeek,
}: {
  game: PrototypeGame
  moveTexts: string[]
  marks: (string | null)[]
  scores: (number | null)[]
  analysisDone: boolean
  bestMoveLabel: string | null
  onAnalyze: () => void
  onSeek: (cursor: number) => void
}) {
  return (
    <section className="card prototype-analysis-panel">
      <div className="card-heading">
        <div>
          <p className="prototype-kicker">AI解析</p>
          <h2>{analysisDone ? `${game.cursor}手目の評価` : '棋譜を解析する'}</h2>
        </div>
        {analysisDone && <span className="prototype-complete">解析済み</span>}
      </div>
      {!analysisDone ? (
        <div className="prototype-empty-analysis">
          <p>棋譜全体を評価し、現在局面の最善手を盤上に表示します。</p>
          <button type="button" className="primary" disabled={game.moves.length === 0} onClick={onAnalyze}>棋譜解析を開始</button>
        </div>
      ) : (
        <>
          <div className="prototype-best-move">
            <span>この局面の最善手</span>
            <strong>{bestMoveLabel ?? '合法手なし'}</strong>
            <small>盤上の青い矢印でも確認できます</small>
          </div>
          <EvalGraph scores={scores} marks={marks} cursor={game.cursor} moveTexts={moveTexts} onSeek={onSeek} />
        </>
      )}
    </section>
  )
}
