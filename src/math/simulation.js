/**
 * RK4 simulation of a closed-loop PID + Plant system.
 * Plant: G(s) = N(s)/D(s) * exp(-L*s)
 * PID (parallel form): u = kp*e + ki*∫e + kd*de/dt
 */

import { polynomialRoots } from '../store/useStore.js'

/**
 * Convert TF coefficients to state-space (controllable canonical form).
 * den = [a0, a1, ..., an]  (a0 + a1*s + ... + an*s^n)
 * num = [b0, b1, ..., bm]  (b0 + b1*s + ... + bm*s^m), m < n
 * Returns { A, B, C, D, n }
 */
export function tfToStateSpace(num, den) {
  // Find actual order (highest non-zero den coeff)
  let n = den.length - 1
  while (n > 0 && Math.abs(den[n]) < 1e-12) n--
  if (n === 0) {
    // Static gain
    const gain = (num[0] || 0) / (den[0] || 1)
    return { A: [[0]], B: [[0]], C: [[gain]], D: [[0]], n: 0, gain }
  }

  const an = den[n]

  // A matrix in controllable canonical form (n×n)
  // [0  1  0  ...]
  // [0  0  1  ...]
  // ...
  // [-a0/an  -a1/an  ...  -a(n-1)/an]
  const A = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => {
      if (i < n - 1) return j === i + 1 ? 1 : 0
      return -den[j] / an
    })
  )

  // B = [0, 0, ..., 1/an]^T
  const B = Array.from({ length: n }, (_, i) => i === n - 1 ? 1 / an : 0)

  // C = [b0/an, b1/an, ..., bm/an, 0, ..., 0]
  const C = Array.from({ length: n }, (_, i) => {
    const bCoeff = num[i] !== undefined ? num[i] : 0
    return bCoeff / an
  })

  // D = 0 (strictly proper)
  return { A, B, C, n }
}

/**
 * Simulate closed-loop system with PID control using RK4.
 * @param {number[]} num - Numerator coefficients [b0, b1, b2]
 * @param {number[]} den - Denominator coefficients [a0, a1, ..., an]
 * @param {number} delay - Transport delay L
 * @param {number} kp - Proportional gain
 * @param {number} ki - Integral gain
 * @param {number} kd - Derivative gain
 * @param {object} opts - { dt, T, r, uMin, uMax }
 * @returns {{ t, y, u, error, states }}
 */
export function simulate(num, den, delay, kp, ki, kd, opts = {}) {
  const { dt, T, r = 1, uMin = -Infinity, uMax = Infinity, openLoop = false } = opts

  const { A, B, C, n, gain } = tfToStateSpace(num, den)

  // Number of delay steps
  const delaySteps = Math.round(delay / dt)

  const steps = Math.ceil(T / dt) + 1

  // State vector: plant states (n) + integral of error (1)
  // x = [x1, x2, ..., xn, xi]
  const state = new Float64Array(n + 1)
  const t = new Float32Array(steps)
  const y = new Float32Array(steps)
  const u = new Float32Array(steps)
  const errArr = new Float32Array(steps)

  // Delay buffer for plant output
  const delayBuf = delaySteps > 0 ? new Float64Array(delaySteps + 1) : null
  let delayIdx = 0

  let ePrev = r  // for derivative
  let yPrev = 0

  for (let step = 0; step < steps; step++) {
    const ti = step * dt
    t[step] = ti

    // Undelayed plant output from state
    const plantRaw = n === 0 ? gain : dotProduct(C, state.slice(0, n))

    // True system output = delayed plant output
    let yOut = plantRaw
    if (delayBuf) {
      yOut = delayBuf[delayIdx]
      delayBuf[delayIdx] = plantRaw
      delayIdx = (delayIdx + 1) % (delaySteps + 1)
    }
    y[step] = yOut

    // Error uses delayed output (true feedback)
    const e = r - yOut
    errArr[step] = e

    // Derivative of error (backward difference)
    const deDt = step === 0 ? 0 : (e - ePrev) / dt

    // PID control signal (or direct unit step in open-loop mode)
    const uRaw = openLoop ? r : kp * e + ki * state[n] + kd * deDt
    const uClamped = Math.max(uMin, Math.min(uMax, uRaw))
    u[step] = uClamped
    ePrev = e

    if (step === steps - 1) break

    // RK4 integration
    // State derivative: dx/dt = f(x, u)
    // For plant states: Ax + Bu
    // For integral: e(t)
    const deriv = (s, uc) => {
      const plantDerivs = Array.from({ length: n }, (_, i) => {
        let sum = 0
        for (let j = 0; j < n; j++) sum += A[i][j] * s[j]
        sum += B[i] * uc
        return sum
      })
      // integral state derivative = e
      const yPt = dotProduct(C, s.slice(0, n))
      const ePt = r - (delayBuf ? yOut : yPt)  // use delayed feedback for integration
      plantDerivs.push(ePt)
      return plantDerivs
    }

    const k1 = deriv(state, uClamped)
    const s2 = state.map((v, i) => v + 0.5 * dt * k1[i])
    const k2 = deriv(s2, uClamped)
    const s3 = state.map((v, i) => v + 0.5 * dt * k2[i])
    const k3 = deriv(s3, uClamped)
    const s4 = state.map((v, i) => v + dt * k3[i])
    const k4 = deriv(s4, uClamped)

    for (let i = 0; i <= n; i++) {
      state[i] += (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i])
    }
  }

  return { t: Array.from(t), y: Array.from(y), u: Array.from(u), error: Array.from(errArr), states: null }
}

function dotProduct(a, b) {
  let s = 0
  const len = Math.min(a.length, b.length)
  for (let i = 0; i < len; i++) s += a[i] * b[i]
  return s
}

/**
 * Compute simulation parameters (dt, T) from plant denominator and delay.
 */
export function computeSimParams(den, delay = 0) {
  let n = den.length - 1
  while (n > 0 && Math.abs(den[n]) < 1e-12) n--
  if (n === 0) return { dt: 0.01, T: Math.max(1, delay + 5) }

  const an = den[n]
  const poly = []
  for (let i = n; i >= 0; i--) poly.push(den[i] / an)

  const roots = polynomialRoots(poly)
  const stablePoles = roots.filter(r => r.re < -1e-10)

  if (stablePoles.length === 0) {
    return { dt: 0.01, T: Math.max(1, delay + 10) }
  }

  const absRe = stablePoles.map(r => Math.abs(r.re))
  const tauMin = 1 / Math.max(...absRe)
  const tauMax = 1 / Math.min(...absRe)

  const dt = Math.max(1e-4, Math.min(0.1, tauMin / 50))
  const T = Math.max(1, Math.min(600, 1.2 * (5 * tauMax + delay)))

  return { dt, T }
}
