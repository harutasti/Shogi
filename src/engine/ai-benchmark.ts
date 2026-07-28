import { analysisOptions, levelToOptions, searchBestMove } from './ai'
import { parseSfen } from './sfen'
import { moveToUsi } from './usi'

export type AiBenchmarkProfile = 'analysis' | 'play-level-2'

export interface AiBenchmarkCase {
  id: string
  category: 'mate' | 'material' | 'promotion' | 'defense' | 'opening'
  profile: AiBenchmarkProfile
  sfen: string
  acceptedMoves: string[]
  description: string
}

export interface AiBenchmarkResult {
  caseId: string
  category: AiBenchmarkCase['category']
  profile: AiBenchmarkProfile
  randomSample: number
  status: 'Pass' | 'Fail'
  selectedMove: string
  depth: number
  nodes: number
  ttHits: number
  qCheckEvasions: number
  elapsedMs: number
}

export const AI_BENCHMARK_RANDOM_SAMPLES = [0, 0.25, 0.5, 0.75, 0.999] as const

export const AI_BENCHMARK_CASES: AiBenchmarkCase[] = [
  {
    id: 'TACT-01',
    category: 'mate',
    profile: 'analysis',
    sfen: '4k4/9/4P4/9/9/9/9/9/4K4 b G 1',
    acceptedMoves: ['G*5b'],
    description: '先手が頭金の1手詰めを選ぶ',
  },
  {
    id: 'TACT-02',
    category: 'mate',
    profile: 'analysis',
    sfen: '4k4/9/9/9/9/9/4p4/9/4K4 w g 1',
    acceptedMoves: ['G*5h'],
    description: '後手が頭金の1手詰めを選ぶ',
  },
  {
    id: 'TACT-03',
    category: 'material',
    profile: 'analysis',
    sfen: '4k4/9/9/9/4g4/9/9/4R4/4K4 b - 1',
    acceptedMoves: ['5h5e'],
    description: '先手が浮いた金を飛車で取る',
  },
  {
    id: 'TACT-04',
    category: 'material',
    profile: 'analysis',
    sfen: '4k4/4r4/9/9/4G4/9/9/9/4K4 w - 1',
    acceptedMoves: ['5b5e'],
    description: '後手が浮いた金を飛車で取る',
  },
  {
    id: 'TACT-05',
    category: 'promotion',
    profile: 'analysis',
    sfen: '4k4/7r1/9/9/9/9/9/1B7/4K4 b - 1',
    acceptedMoves: ['8h2b+'],
    description: '先手が飛車を取りながら角を成る',
  },
  {
    id: 'TACT-06',
    category: 'promotion',
    profile: 'analysis',
    sfen: '4k4/7b1/9/9/9/9/9/1R7/4K4 w - 1',
    acceptedMoves: ['2b8h+'],
    description: '後手が飛車を取りながら角を成る',
  },
  {
    id: 'TACT-07',
    category: 'defense',
    profile: 'analysis',
    sfen: '4k4/9/9/9/9/9/9/4r4/4K4 b - 1',
    acceptedMoves: ['5i5h'],
    description: '先手玉が王手している飛車を取る',
  },
  {
    id: 'TACT-08',
    category: 'defense',
    profile: 'analysis',
    sfen: '4k4/4R4/9/9/9/9/9/9/4K4 w - 1',
    acceptedMoves: ['5a5b'],
    description: '後手玉が王手している飛車を取る',
  },
  {
    id: 'OPEN-01',
    category: 'opening',
    profile: 'play-level-2',
    sfen: 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1',
    acceptedMoves: ['9g9f', '8g8f', '7g7f', '6g6f', '5g5f', '4g4f', '3g3f', '2g2f', '1g1f', '7i6h', '3i4h'],
    description: '初期局面で歩または銀を自然に進める',
  },
  {
    id: 'OPEN-02',
    category: 'opening',
    profile: 'play-level-2',
    sfen: 'lnsgkgsnl/1r5b1/ppppppppp/9/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL w - 2',
    acceptedMoves: ['9c9d', '8c8d', '7c7d', '6c6d', '5c5d', '4c4d', '3c3d', '2c2d', '1c1d'],
    description: '7六歩のあと後手が歩を進めて駒組みする',
  },
  {
    id: 'OPEN-03',
    category: 'opening',
    profile: 'play-level-2',
    sfen: 'lnsgkgsnl/1r5b1/pppppp1pp/6p2/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL b - 3',
    acceptedMoves: ['2g2f', '6g6f', '5g5f', '4g4f', '3g3f', '3i4h', '2h5h', '8h6f', '8h2b+'],
    description: '角道を開け合ったあと自然な駒組みを選ぶ',
  },
  {
    id: 'OPEN-04',
    category: 'opening',
    profile: 'play-level-2',
    sfen: 'lnsgkgsnl/1r5b1/p1ppppppp/1p7/9/7P1/PPPPPPP1P/1B5R1/LNSGKGSNL b - 3',
    acceptedMoves: ['2f2e', '7g7f', '6g6f', '5g5f', '4g4f', '3g3f', '7i6h', '3i4h'],
    description: '飛車先を突き合ったあと攻めか駒組みを進める',
  },
]

export function runAiBenchmark(cases = AI_BENCHMARK_CASES): AiBenchmarkResult[] {
  const results: AiBenchmarkResult[] = []
  for (const benchmarkCase of cases) {
    const samples = benchmarkCase.profile === 'play-level-2'
      ? AI_BENCHMARK_RANDOM_SAMPLES
      : [0]
    for (const randomSample of samples) {
      const position = parseSfen(benchmarkCase.sfen)
      const options = benchmarkCase.profile === 'play-level-2'
        ? { ...levelToOptions(2), randomSource: () => randomSample }
        : { ...analysisOptions(800), maxDepth: 4, randomSource: () => randomSample }
      const started = performance.now()
      const search = searchBestMove(position, options)
      const selectedMove = search.move ? moveToUsi(search.move) : ''
      results.push({
        caseId: benchmarkCase.id,
        category: benchmarkCase.category,
        profile: benchmarkCase.profile,
        randomSample,
        status: benchmarkCase.acceptedMoves.includes(selectedMove) ? 'Pass' : 'Fail',
        selectedMove,
        depth: search.depth,
        nodes: search.nodes,
        ttHits: search.ttHits,
        qCheckEvasions: search.qCheckEvasions,
        elapsedMs: performance.now() - started,
      })
    }
  }
  return results
}
