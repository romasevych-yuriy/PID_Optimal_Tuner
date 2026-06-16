/**
 * GWO (Grey Wolf Optimizer) Web Worker
 * Alpha, Beta, Delta wolves guide the search
 */
import { objectiveFunction } from './costFunction.js'

self.onmessage = function(e) {
  const { config } = e.data
  const { population = 25, iterations = 100, kpMax = 200, kiMax = 200, kdMax = 200 } = config.optimizer

  const nDim = 3
  const domain = [[0, kpMax], [0, kiMax], [0, kdMax]]

  const costFn = (pos) => objectiveFunction(pos[0], pos[1], pos[2], config)

  // Initialize wolves
  let wolves = []
  for (let k = 0; k < population; k++) {
    const pos = domain.map(([a, b]) => a + Math.random() * (b - a))
    wolves.push(pos)
  }
  let wolveCosts = wolves.map(costFn)

  // Sort to find alpha, beta, delta
  const sortedIdx = wolveCosts.map((c, i) => [c, i]).sort((a, b) => a[0] - b[0])
  let alpha = { pos: [...wolves[sortedIdx[0][1]]], cost: sortedIdx[0][0] }
  let beta  = { pos: [...wolves[sortedIdx[1][1]]], cost: sortedIdx[1][0] }
  let delta = { pos: [...wolves[sortedIdx[2][1]]], cost: sortedIdx[2][0] }

  const costHistory = [alpha.cost]

  for (let iter = 1; iter < iterations; iter++) {
    // Linearly decreasing a from 2 to 0
    const a = 2 - iter * (2 / iterations)

    for (let k = 0; k < population; k++) {
      const wolf = wolves[k]

      // Update position based on alpha, beta, delta
      const newPos = wolf.map((_, j) => {
        const update = (leader) => {
          const r1 = Math.random(), r2 = Math.random()
          const A = 2 * a * r1 - a
          const C = 2 * r2
          const D = Math.abs(C * leader.pos[j] - wolf[j])
          return leader.pos[j] - A * D
        }
        const X1 = update(alpha)
        const X2 = update(beta)
        const X3 = update(delta)
        return (X1 + X2 + X3) / 3
      })

      // Clamp to domain
      for (let j = 0; j < nDim; j++) {
        newPos[j] = Math.max(domain[j][0], Math.min(domain[j][1], newPos[j]))
      }

      const newCost = costFn(newPos)
      if (newCost < wolveCosts[k]) {
        wolves[k] = newPos
        wolveCosts[k] = newCost
      }
    }

    // Update alpha, beta, delta
    const sorted = wolveCosts.map((c, i) => [c, i]).sort((a, b) => a[0] - b[0])
    alpha = { pos: [...wolves[sorted[0][1]]], cost: sorted[0][0] }
    beta  = { pos: [...wolves[sorted[1] ? sorted[1][1] : sorted[0][1]]], cost: sorted[1] ? sorted[1][0] : sorted[0][0] }
    delta = { pos: [...wolves[sorted[2] ? sorted[2][1] : sorted[0][1]]], cost: sorted[2] ? sorted[2][0] : sorted[0][0] }

    costHistory.push(alpha.cost)
    if ((iter + 1) % 10 === 0) {
      self.postMessage({ type: 'progress', iteration: iter + 1, iterations, bestCost: alpha.cost, percent: (iter + 1) / iterations * 100 })
    }
  }

  self.postMessage({
    type: 'result',
    kp: alpha.pos[0], ki: alpha.pos[1], kd: alpha.pos[2],
    bestCost: alpha.cost, costHistory,
  })
}
