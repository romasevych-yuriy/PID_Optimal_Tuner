/**
 * LDWPSO (Linear Decreasing Weight PSO) Web Worker
 * w linearly decreases from Wmax=0.9 to Wmin=0.4
 */
import { objectiveFunction } from './costFunction.js'

self.onmessage = function(e) {
  const { config } = e.data
  const { population = 25, iterations = 200, kpMax = 100, kiMax = 100, kdMax = 100 } = config.optimizer

  const nDim = 3
  const WMax = 0.9, WMin = 0.4, c1 = 1.19, c2 = 1.19
  const domain = [[0, kpMax], [0, kiMax], [0, kdMax]]

  const costFn = (pos) => objectiveFunction(pos[0], pos[1], pos[2], config)

  const swarm = []
  for (let k = 0; k < population; k++) {
    const pos = domain.map(([a, b]) => a + Math.random() * (b - a))
    const cost = costFn(pos)
    swarm.push({ pos: [...pos], vel: [0, 0, 0], cost, best: [...pos], bestCost: cost })
  }

  let gBestCost = Math.min(...swarm.map(p => p.bestCost))
  let gBestPos = [...swarm.find(p => p.bestCost === gBestCost).best]
  const costHistory = [gBestCost]

  for (let iter = 1; iter < iterations; iter++) {
    const w = (WMax - WMin) * ((iterations - iter) / iterations) + WMin

    for (const p of swarm) {
      const r1 = [Math.random(), Math.random(), Math.random()]
      const r2 = [Math.random(), Math.random(), Math.random()]

      for (let j = 0; j < nDim; j++) {
        p.vel[j] = w * p.vel[j]
          + c1 * r1[j] * (p.best[j] - p.pos[j])
          + c2 * r2[j] * (gBestPos[j] - p.pos[j])
        p.pos[j] += p.vel[j]
        if (p.pos[j] < domain[j][0]) { p.vel[j] = 0; p.pos[j] = domain[j][0] }
        if (p.pos[j] > domain[j][1]) { p.vel[j] = 0; p.pos[j] = domain[j][1] }
      }

      p.cost = costFn(p.pos)
      if (p.cost < p.bestCost) { p.bestCost = p.cost; p.best = [...p.pos] }
    }

    for (const p of swarm) {
      if (p.bestCost < gBestCost) { gBestCost = p.bestCost; gBestPos = [...p.best] }
    }

    costHistory.push(gBestCost)
    if ((iter + 1) % 10 === 0) {
      self.postMessage({ type: 'progress', iteration: iter + 1, iterations, bestCost: gBestCost, percent: (iter + 1) / iterations * 100 })
    }
  }

  self.postMessage({
    type: 'result',
    kp: gBestPos[0], ki: gBestPos[1], kd: gBestPos[2],
    bestCost: gBestCost, costHistory,
  })
}
