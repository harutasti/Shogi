import { runAiBenchmark } from '../src/engine/ai-benchmark'

const results = runAiBenchmark()

console.log('run_id,case_id,category,profile,random_sample,status,selected_move,depth,nodes,tt_hits,q_check_evasions,elapsed_ms')
for (const result of results) {
  console.log([
    'IMPROVED-001',
    result.caseId,
    result.category,
    result.profile,
    result.randomSample,
    result.status,
    result.selectedMove,
    result.depth,
    result.nodes,
    result.ttHits,
    result.qCheckEvasions,
    result.elapsedMs.toFixed(3),
  ].join(','))
}

const passed = results.filter((result) => result.status === 'Pass').length
console.error(`AI benchmark: ${passed}/${results.length} passed`)
if (passed !== results.length) throw new Error('AI benchmark failed')
