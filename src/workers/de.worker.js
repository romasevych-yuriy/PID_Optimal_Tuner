/**
 * DE/best/1/bin (Differential Evolution) Web Worker
 * CR=0.5, SF=0.6
 */
import { objectiveFunction } from './costFunction.js'

self.onmessage = function(e) {
  const { config } = e.data
  const { population = 25, iterations = 200, kpMax = 100, kiMax = 100, kdMax = 100 } = config.optimizer

  const nDim = 3
  const CR = 0.5, SF = 0.6
  const domain = [[0, kpMax], [0, kiMax], [0, kdMax]]

  const costFn = (pos) => objectiveFunction(pos[0], pos[1], pos[2], config)

  // Initialize population
  let gen = []
  for (let k = 0; k < population; k++) {
    const pos = domain.map(([a, b]) => a + Math.random() * (b - a))
    gen.push(pos)
  }
  let costs = gen.map(costFn)

  let bestCost = Math.min(...costs)
  let bestIdx = costs.indexOf(bestCost)
  const costHistory = [bestCost]

  for (let step = 1; step < iterations; step++) {
    for (let k = 0; k < population; k++) {
      // DE/best/1/bin: i1 = best, i2, i3 random (distinct from i1 and each other)
      const i1 = bestIdx
      const allIdx = Array.from({ length: population }, (_, i) => i).filter(i => i !== i1)
      const i2 = allIdx[Math.floor(Math.random() * allIdx.length)]
      const reduced = allIdx.filter(i => i !== i2)
      const i3 = reduced[Math.floor(Math.random() * reduced.length)]

      // Donor vector
      const donor = gen[i1].map((v, j) => v + SF * (gen[i2][j] - gen[i3][j]))

      // Clamp donor
      for (let j = 0; j < nDim; j++) {
        donor[j] = Math.max(domain[j][0], Math.min(domain[j][1], donor[j]))
      }

      // Trial vector (binomial crossover)
      const iRand = Math.floor(Math.random() * nDim)
      const trial = gen[k].map((v, j) =>
        (Math.random() <= CR || j === iRand) ? donor[j] : v
      )

      const trialCost = costFn(trial)
      if (trialCost < costs[k]) {
        gen[k] = trial
        costs[k] = trialCost
        if (trialCost < bestCost) {
          bestCost = trialCost
          bestIdx = k
        }
      }
    }

    costHistory.push(bestCost)
    if ((step + 1) % 10 === 0) {
      self.postMessage({ type: 'progress', iteration: step + 1, iterations, bestCost, percent: (step + 1) / iterations * 100 })
    }
  }

  const best = gen[bestIdx]
  self.postMessage({
    type: 'result',
    kp: best[0], ki: best[1], kd: best[2],
    bestCost, costHistory,
  })
}
