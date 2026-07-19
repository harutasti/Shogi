// AI 思考用 Web Worker。UI スレッドをブロックせずに探索する
import { parseSfen } from '../engine/sfen'
import { analyzePosition, levelToOptions, searchBestMove } from '../engine/ai'
import type { Move } from '../engine/types'

export interface SearchRequest {
  type: 'search'
  id: number
  sfen: string
  level: number
}

export interface AnalyzeRequest {
  type: 'analyze'
  id: number
  sfens: string[]
  timeMsPerPosition: number
}

export type WorkerRequest = SearchRequest | AnalyzeRequest

export type WorkerResponse =
  | { type: 'searchResult'; id: number; move: Move | null; score: number }
  | { type: 'analyzeProgress'; id: number; index: number; total: number; score: number; bestMove: Move | null }
  | { type: 'analyzeDone'; id: number }

const post = (msg: WorkerResponse): void => {
  ;(self as unknown as Worker).postMessage(msg)
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data
  if (msg.type === 'search') {
    const pos = parseSfen(msg.sfen)
    const result = searchBestMove(pos, levelToOptions(msg.level))
    post({ type: 'searchResult', id: msg.id, move: result.move, score: result.score })
  } else if (msg.type === 'analyze') {
    const total = msg.sfens.length
    for (let i = 0; i < total; i++) {
      const pos = parseSfen(msg.sfens[i])
      const result = analyzePosition(pos, msg.timeMsPerPosition)
      post({
        type: 'analyzeProgress',
        id: msg.id,
        index: i,
        total,
        score: result.score,
        bestMove: result.move,
      })
    }
    post({ type: 'analyzeDone', id: msg.id })
  }
}
