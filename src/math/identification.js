/**
 * System identification via least squares / optimization.
 * Given step response data, finds best-fit transfer function coefficients.
 */

import { simulate, computeSimParams } from './simulation.js'

/**
 * Identify transfer function from step response data.
 * Uses PSO-style random search + gradient refinement.
 * @param {number[]} tData - Time data
 * @param {number[]} yData - Output data
 * @param {number} order - Denominator order (1-4)
 * @param {boolean} useDelay - Whether to include transport delay
 * @returns {{ num, den, delay, mse, predicted }}
 */
export function identifyTF(tData, yData, order = 2, useDelay = false, uData = null) {
  const T = tData[tData.length - 1]
  const n = order
  const numOrder = Math.min(n - 1, 2)

  // Normalize output
  const yMax = Math.max(...yData.map(Math.abs))
  const yNorm = yData.map(v => v / (yMax || 1))

  // Normalize input (actual u(t) if provided, otherwise unit step)
  const uMax = uData ? Math.max(...uData.map(Math.abs)) : 1.0
  const uNorm = uData ? uData.map(v => v / (uMax || 1)) : null
  const rFn = uNorm ? (t) => interpolate(tData, uNorm, t) : 1.0

  let bestMSE = Infinity
  let bestParams = null

  const DCgain = yNorm[yNorm.length - 1] || 1

  // Multi-start random search
  const nTries = 200
  for (let trial = 0; trial < nTries; trial++) {
    const params = generateRandomParams(n, numOrder, useDelay, DCgain, T)
    const mse = evalParams(params, tData, yNorm, n, numOrder, useDelay, rFn, T)
    if (mse < bestMSE) {
      bestMSE = mse
      bestParams = [...params]
    }
  }

  // Refine with Nelder-Mead
  if (bestParams) {
    const result = nelderMead(
      p => evalParams(p, tData, yNorm, n, numOrder, useDelay, rFn, T),
      bestParams,
      { maxIter: 500, tol: 1e-8 }
    )
    bestParams = result.x
    bestMSE = result.fval
  }

  // Reconstruct TF and scale back to physical units: G_physical = G_normalized * yMax / uMax
  const { num, den, delay } = paramsToTF(bestParams, n, numOrder, useDelay, DCgain)
  const numScaled = num.map(v => v * yMax / uMax)

  // Predicted response using actual (unscaled) input
  const rActual = uData ? (t) => interpolate(tData, uData, t) : 1.0
  const { dt } = computeSimParams(den, delay)
  const simResult = simulate(numScaled, den, delay, 0, 0, 0, { dt, T: T * 1.1, r: rActual, openLoop: true })

  return { num: numScaled, den, delay, mse: bestMSE, predicted: { t: simResult.t, y: simResult.y } }
}

function generateRandomParams(n, numOrder, useDelay, DCgain, T) {
  const params = []
  // Denominator coefficients a1..a_{n-1} (a0=gain, an=1)
  const gain = DCgain * (0.5 + Math.random())
  params.push(Math.max(0.01, gain))  // a0 (DC gain numerator/denominator)

  // Time constants: distribute between 0.01 and T/n
  for (let i = 1; i < n; i++) {
    params.push(Math.random() * T / n + 0.01)
  }
  // Numerator coefficients
  for (let i = 0; i <= numOrder; i++) {
    params.push((Math.random() - 0.5) * 0.5)
  }
  // Delay
  if (useDelay) {
    params.push(Math.random() * T * 0.2)
  }
  return params
}

function paramsToTF(params, n, numOrder, useDelay, DCgain) {
  // Simple factored form: G(s) = K * b(s) / a(s)
  // where a(s) = prod(tau_i * s + 1)
  // Let's use direct coefficient approach

  // params = [a0, a1, ..., a_{n-1}, b0, b1, ..., bm, L?]
  // but interpret as: G(s) = (b0 + b1*s...) / (a0 + a1*s + ... + s^n)
  const a = []
  for (let i = 0; i < n; i++) a.push(params[i])
  a.push(1) // leading coeff = 1

  const b = []
  for (let i = 0; i <= numOrder; i++) {
    b.push(params[n + i])
  }

  const delay = useDelay ? Math.max(0, params[n + numOrder + 1]) : 0

  return { num: b, den: a, delay }
}

function evalParams(params, tData, yNorm, n, numOrder, useDelay, r, T) {
  try {
    const { num, den, delay } = paramsToTF(params, n, numOrder, useDelay, 1)

    // Check stability (all den coeffs > 0 is necessary but not sufficient)
    if (den.some(v => v <= 0)) return 1e10

    const { dt } = computeSimParams(den, delay)
    const result = simulate(num, den, delay, 0, 0, 0, { dt, T: T * 1.1, r, openLoop: true })

    // Interpolate predicted to match tData
    let mse = 0
    for (let i = 0; i < tData.length; i++) {
      const ti = tData[i]
      const yi = interpolate(result.t, result.y, ti)
      mse += (yi - yNorm[i]) ** 2
    }
    return mse / tData.length
  } catch {
    return 1e10
  }
}

function interpolate(t, y, ti) {
  if (ti <= t[0]) return y[0]
  if (ti >= t[t.length - 1]) return y[t.length - 1]
  let lo = 0, hi = t.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (t[mid] <= ti) lo = mid; else hi = mid
  }
  const frac = (ti - t[lo]) / (t[hi] - t[lo])
  return y[lo] + frac * (y[hi] - y[lo])
}

function nelderMead(f, x0, { maxIter = 500, tol = 1e-8 } = {}) {
  const n = x0.length
  const alpha = 1, gamma = 2, rho = 0.5, sigma = 0.5

  // Initialize simplex
  let simplex = [x0.slice()]
  for (let i = 0; i < n; i++) {
    const x = x0.slice()
    x[i] = x[i] !== 0 ? x[i] * 1.05 : 0.00025
    simplex.push(x)
  }

  let fvals = simplex.map(f)

  for (let iter = 0; iter < maxIter; iter++) {
    // Sort
    const order = fvals.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0])
    const sorted = order.map(o => ({ f: o[0], x: simplex[o[1]].slice() }))
    simplex = sorted.map(s => s.x)
    fvals = sorted.map(s => s.f)

    if (fvals[fvals.length - 1] - fvals[0] < tol) break

    // Centroid of all but worst
    const xObar = Array(n).fill(0)
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) xObar[j] += simplex[i][j]
      xObar[j] /= n
    }

    // Reflection
    const xr = xObar.map((v, j) => v + alpha * (v - simplex[n][j]))
    const fr = f(xr)

    if (fvals[0] <= fr && fr < fvals[n - 1]) {
      simplex[n] = xr
      fvals[n] = fr
      continue
    }

    if (fr < fvals[0]) {
      // Expansion
      const xe = xObar.map((v, j) => v + gamma * (xr[j] - v))
      const fe = f(xe)
      if (fe < fr) { simplex[n] = xe; fvals[n] = fe }
      else { simplex[n] = xr; fvals[n] = fr }
      continue
    }

    // Contraction
    const xc = xObar.map((v, j) => v + rho * (simplex[n][j] - v))
    const fc = f(xc)
    if (fc < fvals[n]) { simplex[n] = xc; fvals[n] = fc; continue }

    // Shrink
    for (let i = 1; i <= n; i++) {
      simplex[i] = simplex[0].map((v, j) => v + sigma * (simplex[i][j] - v))
      fvals[i] = f(simplex[i])
    }
  }

  return { x: simplex[0], fval: fvals[0] }
}
