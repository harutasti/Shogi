import { describe, expect, it } from 'vitest'
import { analysisOptions, levelToOptions, searchBestMove } from './ai'
import { AI_BENCHMARK_CASES, runAiBenchmark } from './ai-benchmark'
import { parseSfen, toSfen } from './sfen'
import { moveToUsi, usiToMove } from './usi'

describe('AI品質ベンチマーク', () => {
  it('固定12局面・28試行の受け入れ手をすべて満たす', { timeout: 30000 }, () => {
    const results = runAiBenchmark()
    expect(results).toHaveLength(28)
    expect(results.filter((result) => result.status === 'Fail')).toEqual([])
  })

  it('ベンチマークの受け入れ手は各SFENで合法である', () => {
    for (const benchmarkCase of AI_BENCHMARK_CASES) {
      const position = parseSfen(benchmarkCase.sfen)
      for (const usi of benchmarkCase.acceptedMoves) {
        expect(usiToMove(position, usi), `${benchmarkCase.id}: ${usi}`).not.toBeNull()
      }
    }
  })
})

describe('探索品質の回帰', () => {
  it('解析は乱数値に関係なく同じ最善手を返す', () => {
    const sfen = AI_BENCHMARK_CASES.find((item) => item.id === 'OPEN-01')!.sfen
    const moves = [0, 0.25, 0.5, 0.75, 0.999].map((sample) => {
      const result = searchBestMove(parseSfen(sfen), {
        ...analysisOptions(800),
        maxDepth: 4,
        randomSource: () => sample,
      })
      return result.move ? moveToUsi(result.move) : ''
    })
    expect(new Set(moves).size).toBe(1)
  })

  it('王手中の静止探索で合法な応手を読む', () => {
    const position = parseSfen('4k4/9/9/9/4g4/9/9/4R4/4K4 b - 1')
    const result = searchBestMove(position, { maxDepth: 3, timeMs: 3000, randomness: 0 })
    expect(result.qCheckEvasions).toBeGreaterThan(0)
  })

  it('置換表を使用して同一局面を再利用する', () => {
    const position = parseSfen(AI_BENCHMARK_CASES.find((item) => item.id === 'OPEN-01')!.sfen)
    const result = searchBestMove(position, { maxDepth: 4, timeMs: 5000, randomness: 0 })
    expect(result.ttHits).toBeGreaterThan(0)
  })

  it('タイムアウトしても入力局面を復元する', () => {
    const position = parseSfen(AI_BENCHMARK_CASES.find((item) => item.id === 'OPEN-01')!.sfen)
    const before = toSfen(position)
    searchBestMove(position, { maxDepth: 20, timeMs: 1, randomness: 0 })
    expect(toSfen(position)).toBe(before)
  })

  it('対局AIと棋譜解析で独立した探索設定を使う', () => {
    expect(levelToOptions(2)).toMatchObject({ maxDepth: 3, timeMs: 1200, randomness: 0 })
    expect(analysisOptions()).toMatchObject({ maxDepth: 5, timeMs: 1200, randomness: 0 })
  })
})
