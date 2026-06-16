/**
 * Shared cost function for PID optimization.
 * Used by all optimizer workers.
 */

/**
 * Compute objective function fOF = PS + PC + Cr
 * @param {number} kp, ki, kd - PID gains
 * @param {object} config - { num, den, delay, dt, T, r, criterion, constraints }
 * @returns {number} objective value
 */
export function objectiveFunction(kp, ki, kd, config) {
  const { num, den, delay, dt, T, r = 1, criterion, constraints } = config

  try {
    // Run simulation
    const result = simRK4(num, den, delay, kp, ki, kd, dt, T, r, constraints)
    const { y, u, t } = result

    if (!y || y.some(v => isNaN(v) || !isFinite(v))) return 1e12

    const n = t.length
    const yFinal = y[n - 1]

    // Compute metrics
    const metrics = computeMetrics(t, y, u, r)

    // Stability penalty PS
    const PS = computePS(yFinal, r)

    // Overshoot penalty PC
    const PC = constraints.useOvershootConstraint
      ? computePC(metrics.overshoot, constraints.overshootMax)
      : 0

    // Criterion Cr
    const Cr = computeCr(metrics, criterion, T, r)

    return PS + PC + Cr
  } catch {
    return 1e12
  }
}

function simRK4(num, den, delay, kp, ki, kd, dt, T, r, constraints) {
  const uMin = constraints.useControlConstraint ? constraints.uMin : -Infinity
  const uMax = constraints.useControlConstraint ? constraints.uMax : Infinity

  // Find actual denominator order
  let n = den.length - 1
  while (n > 0 && Math.abs(den[n]) < 1e-12) n--
  if (n === 0) {
    const gain = (num[0] || 0) / (den[0] || 1)
    const steps = Math.ceil(T / dt) + 1
    const t = [], y = [], u = []
    for (let i = 0; i < steps; i++) { t.push(i * dt); y.push(gain * r); u.push(0) }
    return { t, y, u }
  }

  const an = den[n]
  // A matrix (controllable canonical form)
  const A = []
  for (let i = 0; i < n; i++) {
    const row = new Float64Array(n)
    if (i < n - 1) row[i + 1] = 1
    else {
      for (let j = 0; j < n; j++) row[j] = -den[j] / an
    }
    A.push(row)
  }
  const B = new Float64Array(n)
  B[n - 1] = 1 / an

  const C = new Float64Array(n)
  for (let i = 0; i < Math.min(num.length, n); i++) C[i] = num[i] / an

  const steps = Math.ceil(T / dt) + 1
  const state = new Float64Array(n + 1)  // +1 for integral
  const delaySteps = delay > 0 ? Math.round(delay / dt) : 0
  const delayBuf = delaySteps > 0 ? new Float64Array(delaySteps + 1) : null
  let delayIdx = 0

  const t = [], y = [], u = []
  let ePrev = r

  for (let step = 0; step < steps; step++) {
    const ti = step * dt
    t.push(ti)

    // Plant output
    let plantY = 0
    for (let i = 0; i < n; i++) plantY += C[i] * state[i]
    y.push(plantY)

    // Delayed feedback
    let yFb = plantY
    if (delayBuf) {
      yFb = delayBuf[delayIdx]
      delayBuf[delayIdx] = plantY
      delayIdx = (delayIdx + 1) % (delaySteps + 1)
    }

    const e = r - yFb
    const deDt = step === 0 ? 0 : (e - ePrev) / dt
    const uRaw = kp * e + ki * state[n] + kd * deDt
    const uOut = Math.max(uMin, Math.min(uMax, uRaw))
    u.push(uOut)
    ePrev = e

    if (step === steps - 1) break

    const deriv = (s, uc) => {
      const d = []
      for (let i = 0; i < n; i++) {
        let sum = 0
        for (let j = 0; j < n; j++) sum += A[i][j] * s[j]
        sum += B[i] * uc
        d.push(sum)
      }
      // integral: dxi/dt = e (use feedforward e = r - plant output at current s)
      let py = 0
      for (let i = 0; i < n; i++) py += C[i] * s[i]
      d.push(r - (delayBuf ? yFb : py))
      return d
    }

    const k1 = deriv(state, uOut)
    const s2 = state.map((v, i) => v + 0.5 * dt * k1[i])
    const k2 = deriv(s2, uOut)
    const s3 = state.map((v, i) => v + 0.5 * dt * k2[i])
    const k3 = deriv(s3, uOut)
    const s4 = state.map((v, i) => v + dt * k3[i])
    const k4 = deriv(s4, uOut)

    for (let i = 0; i <= n; i++) {
      state[i] += (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i])
    }
  }

  return { t, y, u }
}

function computeMetrics(t, y, u, r) {
  const n = t.length
  const dt = t.length > 1 ? t[1] - t[0] : 0.01
  const T = t[n - 1]

  const lastIdx = Math.floor(0.9 * n)
  let ssSum = 0, ssCount = 0
  for (let i = lastIdx; i < n; i++) { ssSum += y[i]; ssCount++ }
  const ySS = ssCount > 0 ? ssSum / ssCount : y[n - 1]

  const yMax = Math.max(...y)
  const overshoot = r > 0 ? Math.max(0, (yMax - r) / r * 100) : 0

  let t10 = 0, t90 = 0
  const y10 = 0.1 * r, y90 = 0.9 * r
  for (let i = 1; i < n; i++) {
    if (y[i - 1] < y10 && y[i] >= y10 && t10 === 0) t10 = t[i]
    if (y[i - 1] < y90 && y[i] >= y90 && t90 === 0) t90 = t[i]
  }
  const riseTime = Math.max(0, t90 - t10)

  const band = 0.02 * Math.abs(r)
  let settlingTime = T
  for (let i = n - 1; i >= 0; i--) {
    if (Math.abs(y[i] - r) > band) {
      settlingTime = i < n - 1 ? t[i + 1] : T
      break
    }
    if (i === 0) settlingTime = 0
  }

  const ess = Math.abs(r - ySS)
  let ITAE = 0, IAE = 0, ISE = 0, ITSE = 0
  for (let i = 0; i < n; i++) {
    const e = Math.abs(r - y[i])
    ITAE += t[i] * e * dt
    IAE += e * dt
    ISE += e * e * dt
    ITSE += t[i] * e * e * dt
  }

  return { ITAE, IAE, ISE, ITSE, overshoot, riseTime, settlingTime, ess }
}

function computePS(yFinal, r) {
  const delta = 0.05  // 5% tolerance
  const err = Math.abs(yFinal - r)
  if (err > delta * Math.abs(r)) {
    return 1e6 * ((yFinal - r) / (delta * Math.abs(r))) ** 2
  }
  return 0
}

function computePC(overshoot, overshootMax) {
  if (!overshootMax || overshootMax <= 0) return 0
  if (overshoot > overshootMax) return 1e3 * (overshoot - overshootMax) ** 2
  return 0
}

function computeCr(metrics, criterion, T, r) {
  const { weights, enabled } = criterion
  const { ITAE, IAE, ISE, ITSE, overshoot, riseTime, settlingTime, ess } = metrics
  const T2h = T * T / 2

  let Cr = 0
  if (enabled.w1) Cr += weights.w1 * ITAE / T2h
  if (enabled.w2) Cr += weights.w2 * IAE / T
  if (enabled.w3) Cr += weights.w3 * ISE / T
  if (enabled.w4) Cr += weights.w4 * ITSE / T2h
  if (enabled.w5) Cr += weights.w5 * overshoot / 100
  if (enabled.w6) Cr += weights.w6 * riseTime / T
  if (enabled.w7) Cr += weights.w7 * settlingTime / T
  if (enabled.w8) Cr += weights.w8 * ess / Math.abs(r)

  return Cr
}
