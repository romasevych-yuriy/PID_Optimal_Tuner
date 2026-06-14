import { create } from 'zustand'

const defaultPlant = {
  method: 'tf',       // 'tf' | 'ident'
  // Transfer function coefficients
  // Denominator: a4*s^4 + a3*s^3 + a2*s^2 + a1*s + a0
  // Numerator:   b2*s^2 + b1*s + b0
  num: [1, 0, 0],     // [b0, b1, b2]
  den: [1, 3, 2, 0, 0], // [a0, a1, a2, a3, a4]
  delay: 0,
  order: 2,           // actual denominator order
  // Identification data
  identData: null,    // { t: [], y: [] }
  identOrder: 2,
  identDelay: false,
}

const defaultCriterion = {
  weights: {
    w1: 0,   // ITAE
    w2: 0,   // IAE
    w3: 1,   // ISE
    w4: 0,   // ITSE
    w5: 0,   // Overshoot
    w6: 0,   // Rise Time
    w7: 0,   // Settling Time
    w8: 0,   // Steady-state error
  },
  enabled: {
    w1: false,
    w2: false,
    w3: true,
    w4: false,
    w5: false,
    w6: false,
    w7: false,
    w8: false,
  },
  // Constraints
  useOvershootConstraint: false,
  overshootMax: 20,     // %
  useControlConstraint: false,
  uMin: -10,
  uMax: 10,
}

const defaultOptimizer = {
  selected: 'PSO',   // 'PSO' | 'LDWPSO' | 'VCTPSO' | 'RingPSO' | 'DE' | 'GWO'
  population: 25,
  iterations: 200,
  bounds: [0, 100],  // [min, max] for kp, ki, kd
}

const defaultResults = {
  kp: null,
  ki: null,
  kd: null,
  // Adjusted params on results page
  kpAdj: null,
  kiAdj: null,
  kdAdj: null,
  // Metrics
  metrics: null,
  // Simulation data
  simData: null,     // { t, y, u, error }
  // Convergence
  convergence: [],
  finalCost: null,
  // Frequency domain
  freqData: null,    // { freq, mag, phase, gainMargin, phaseMargin }
  // Status
  allConstraintsMet: false,
  statusMessage: '',
}

const useStore = create((set, get) => ({
  plant: { ...defaultPlant },
  criterion: { ...defaultCriterion },
  optimizer: { ...defaultOptimizer },
  results: { ...defaultResults },
  currentPage: 0,

  setPlant: (updates) => set((s) => ({ plant: { ...s.plant, ...updates } })),
  setCriterion: (updates) => set((s) => ({ criterion: { ...s.criterion, ...updates } })),
  setOptimizerConfig: (updates) => set((s) => ({ optimizer: { ...s.optimizer, ...updates } })),
  setResults: (updates) => set((s) => ({ results: { ...s.results, ...updates } })),
  setCurrentPage: (page) => set({ currentPage: page }),

  resetResults: () => set({ results: { ...defaultResults } }),

  // Compute dt and T from plant poles
  getSimParams: () => {
    const { plant } = get()
    return computeSimParams(plant.den, plant.delay)
  },
}))

function computeSimParams(den, delay = 0) {
  // Find actual order
  let n = den.length - 1
  while (n > 0 && Math.abs(den[n]) < 1e-12) n--
  if (n === 0) return { dt: 0.01, T: 10 }

  // Build monic polynomial coefficients [s^n, s^{n-1}, ..., s^0]
  // den is [a0, a1, ..., an] → poly = [an, a_{n-1}, ..., a0]
  const poly = []
  for (let i = n; i >= 0; i--) poly.push(den[i])
  const an = poly[0]
  const monic = poly.map(c => c / an)

  // Find roots of monic polynomial using companion matrix eigenvalues
  const roots = polynomialRoots(monic)

  // Filter stable poles (Re < 0)
  const stablePoles = roots.filter(r => r.re < -1e-10)

  let dt, T
  if (stablePoles.length === 0) {
    dt = 0.01
    T = 10
  } else {
    const absRe = stablePoles.map(r => Math.abs(r.re))
    const tauMin = 1 / Math.max(...absRe)
    const tauMax = 1 / Math.min(...absRe)
    dt = Math.max(1e-4, Math.min(0.1, tauMin / 50))
    T = Math.max(1, Math.min(600, 1.2 * (5 * tauMax + delay)))
  }

  return { dt, T, n }
}

// Find roots of polynomial p[0]*x^n + p[1]*x^{n-1} + ... + p[n]
// using companion matrix approach and QR iteration (simplified)
function polynomialRoots(monic) {
  const n = monic.length - 1
  if (n <= 0) return []
  if (n === 1) return [{ re: -monic[1] / monic[0], im: 0 }]
  if (n === 2) {
    // Quadratic formula
    const [a, b, c] = monic
    const disc = b * b - 4 * a * c
    if (disc >= 0) {
      return [
        { re: (-b + Math.sqrt(disc)) / (2 * a), im: 0 },
        { re: (-b - Math.sqrt(disc)) / (2 * a), im: 0 },
      ]
    } else {
      const re = -b / (2 * a)
      const im = Math.sqrt(-disc) / (2 * a)
      return [{ re, im }, { re, im: -im }]
    }
  }

  // For higher order: Durand-Kerner method
  const N = n
  // Cauchy bound: all roots lie inside circle of radius r = 1 + max|coeff|
  const cauchyR = Math.max(1, ...monic.slice(1).map(Math.abs))
  let roots = []
  for (let k = 0; k < N; k++) {
    const angle = (2 * Math.PI * k) / N
    roots.push({ re: cauchyR * 0.5 * Math.cos(angle), im: cauchyR * 0.5 * Math.sin(angle) })
  }

  for (let iter = 0; iter < 200; iter++) {
    let maxChange = 0
    const newRoots = roots.map((ri, i) => {
      // Evaluate polynomial at ri
      let pr = { re: monic[0], im: 0 }
      for (let j = 1; j <= N; j++) {
        pr = complexMul(pr, ri)
        pr.re += monic[j]
      }
      // Product of (ri - rj) for j != i
      let prod = { re: 1, im: 0 }
      for (let j = 0; j < N; j++) {
        if (j !== i) {
          prod = complexMul(prod, { re: ri.re - roots[j].re, im: ri.im - roots[j].im })
        }
      }
      const denom = prod.re * prod.re + prod.im * prod.im
      if (denom < 1e-30) return ri
      const delta = {
        re: (pr.re * prod.re + pr.im * prod.im) / denom,
        im: (pr.im * prod.re - pr.re * prod.im) / denom,
      }
      maxChange = Math.max(maxChange, Math.sqrt(delta.re ** 2 + delta.im ** 2))
      return { re: ri.re - delta.re, im: ri.im - delta.im }
    })
    roots = newRoots
    if (maxChange < 1e-10) break
  }

  return roots
}

function complexMul(a, b) {
  return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }
}

export default useStore
export { computeSimParams, polynomialRoots }
