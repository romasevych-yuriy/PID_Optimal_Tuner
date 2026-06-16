/**
 * VCTPSO (Variable Cognitive Topology PSO) Web Worker
 * Every RC=5 iterations, the cognitive reference changes to a random particle
 */
import { objectiveFunction } from './costFunction.js'

self.onmessage = function(e) {
  const { config } = e.data
  const { population = 25, iterations = 200, kpMax = 100, kiMax = 100, kdMax = 100 } = config.optimizer

  const nDim = 3
  const w = 0.72, c1 = 1.19, c2 = 1.19, RC = 5
  const domain = [[0, kpMax], [0, kiMax], [0, kdMax]]

  const costFn = (pos) => objectiveFunction(pos[0], pos[1], pos[2], config)

  const swarm = []
  for (let k = 0; k < population; k++) {
    const pos = domain.map(([a, b]) => a + Math.random() * (b - a))
    const cost = costFn(pos)
    swarm.push({ pos: [...pos], vel: [0, 0, 0], cost, best: [...pos], bestCost: cost })
  }

  let gBestCost = Math.min(...swarm.map(p => p.bestCost))
  let gBestIdx = swarm.findIndex(p => p.bestCost === gBestCost)
  let gBestPos = [...swarm[gBestIdx].best]
  const costHistory = [gBestCost]

  for (let step = 1; step < iterations; step++) {
    for (let k = 0; k < population; k++) {
      const p = swarm[k]
      const r1 = [Math.random(), Math.random(), Math.random()]
      const r2 = [Math.random(), Math.random(), Math.random()]

      // Variable cognitive topology: if step is multiple of RC, use random particle's best
      const cogIdx = (step % RC === 0) ? Math.floor(Math.random() * population) : k
      const cogBest = swarm[cogIdx].best

      for (let j = 0; j < nDim; j++) {
        p.vel[j] = w * p.vel[j]
          + c1 * r1[j] * (cogBest[j] - p.pos[j])
          + c2 * r2[j] * (gBestPos[j] - p.pos[j])
        p.pos[j] += p.vel[j]
        if (p.pos[j] < domain[j][0]) { p.vel[j] = 0; p.pos[j] = domain[j][0] }
        if (p.pos[j] > domain[j][1]) { p.vel[j] = 0; p.pos[j] = domain[j][1] }
      }

      p.cost = costFn(p.pos)
      if (p.cost < p.bestCost) { p.bestCost = p.cost; p.best = [...p.pos] }
    }

    for (let k = 0; k < population; k++) {
      if (swarm[k].bestCost < gBestCost) { gBestCost = swarm[k].bestCost; gBestPos = [...swarm[k].best] }
    }

    costHistory.push(gBestCost)
    if ((step + 1) % 10 === 0) {
      self.postMessage({ type: 'progress', iteration: step + 1, iterations, bestCost: gBestCost, percent: (step + 1) / iterations * 100 })
    }
  }

  self.postMessage({
    type: 'result',
    kp: gBestPos[0], ki: gBestPos[1], kd: gBestPos[2],
    bestCost: gBestCost, costHistory,
  })
}
