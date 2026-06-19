/**
 * Performance metrics for step response and cost function calculation.
 */

/**
 * Compute all performance metrics from simulation data.
 * @param {number[]} t - Time array
 * @param {number[]} y - Output array
 * @param {number[]} u - Control signal array
 * @param {number} r - Setpoint (step value)
 * @returns {object} metrics
 */
export function computeMetrics(t, y, u, r = 1) {
  const n = t.length
  const dt = t.length > 1 ? t[1] - t[0] : 0.01
  const T = t[n - 1]

  // Steady-state value (average of last 10% of simulation)
  const lastIdx = Math.floor(0.9 * n)
  let ssSum = 0, ssCount = 0
  for (let i = lastIdx; i < n; i++) { ssSum += y[i]; ssCount++ }
  const ySS = ssCount > 0 ? ssSum / ssCount : y[n - 1]

  // Overshoot
  const yMax = Math.max(...y)
  const overshoot = r > 0 ? Math.max(0, (yMax - r) / r * 100) : 0

  // Rise time (10% to 90% of setpoint, for non-oscillatory or first crossing)
  let t10 = 0, t90 = 0
  const y10 = 0.1 * r, y90 = 0.9 * r
  for (let i = 1; i < n; i++) {
    if (y[i - 1] < y10 && y[i] >= y10 && t10 === 0) t10 = t[i]
    if (y[i - 1] < y90 && y[i] >= y90 && t90 === 0) t90 = t[i]
  }
  const riseTime = t90 - t10

  // Settling time (within 2% band around setpoint)
  const band = 0.02 * Math.abs(r)
  let settlingTime = T
  for (let i = n - 1; i >= 0; i--) {
    if (Math.abs(y[i] - r) > band) {
      settlingTime = t[i + 1] !== undefined ? t[i + 1] : T
      break
    }
    if (i === 0) settlingTime = 0
  }

  // Steady-state error
  const ess = Math.abs(r - ySS)

  // Integral metrics
  let ITAE = 0, IAE = 0, ISE = 0, ITSE = 0
  for (let i = 0; i < n; i++) {
    const e = Math.abs(r - y[i])
    ITAE += t[i] * e * dt
    IAE += e * dt
    ISE += e * e * dt
    ITSE += t[i] * e * e * dt
  }

  return { ITAE, IAE, ISE, ITSE, overshoot, riseTime, settlingTime, ess, ySS }
}

/**
 * Compute normalized cost function.
 * Cr = δ1*ITAE/(T²/2) + δ2*IAE/T + δ3*ISE/T + δ4*ITSE/(T²/2)
 *    + δ5*Osh/100 + δ6*tr/T + δ7*ts/T + δ8*ess/r
 */
export function computeCriterion(metrics, weights, enabled, T, r = 1) {
  const { ITAE, IAE, ISE, ITSE, overshoot, riseTime, settlingTime, ess } = metrics
  const { w1, w2, w3, w4, w5, w6, w7, w8 } = weights
  const { w1: e1, w2: e2, w3: e3, w4: e4, w5: e5, w6: e6, w7: e7, w8: e8 } = enabled

  let Cr = 0
  if (e1) Cr += w1 * ITAE / (T * T / 2)
  if (e2) Cr += w2 * IAE / T
  if (e3) Cr += w3 * ISE / T
  if (e4) Cr += w4 * ITSE / (T * T / 2)
  if (e5) Cr += w5 * overshoot / 100
  if (e6) Cr += w6 * riseTime / T
  if (e7) Cr += w7 * settlingTime / T
  if (e8) Cr += w8 * ess / Math.abs(r)

  return Cr
}

/**
 * Compute stability penalty PS.
 * xi(T) should be ≈ r for the output state.
 * For states beyond the controlled variable, they should be ≈ 0.
 */
export function computeStabilityPenalty(yFinal, r, statesFinal = []) {
  const delta = 1e-5
  let PS = 0

  // Check output variable
  const eDelta = Math.abs(yFinal - r)
  if (eDelta > 0.05) {  // 5% tolerance for output
    PS += 1e6 * ((yFinal - r) / 0.05) ** 2
  }

  return PS
}

/**
 * Compute overshoot penalty PC.
 */
export function computeOvershootPenalty(overshoot, overshootMax) {
  if (!overshootMax || overshoot <= overshootMax) return 0
  return 1e3 * (overshoot / overshootMax) ** 2
}

/**
 * Remove ±360° jumps from a phase array (degrees).
 */
function unwrapPhase(phases) {
  const out = [...phases]
  for (let i = 1; i < out.length; i++) {
    let diff = out[i] - out[i - 1]
    while (diff >  180) diff -= 360
    while (diff < -180) diff += 360
    out[i] = out[i - 1] + diff
  }
  return out
}

/**
 * Compute Bode plot data for open-loop transfer function C(jω)*G(jω).
 * @param {number[]} num - Plant numerator
 * @param {number[]} den - Plant denominator
 * @param {number} delay - Transport delay
 * @param {number} kp, ki, kd - PID gains
 */
export function computeBode(num, den, delay, kp, ki, kd) {
  const N = 2000
  const wMin = 1e-3
  // Limit upper frequency when delay is present to avoid dense aliasing
  const wMax = delay > 0 ? Math.min(1e3, 10 / delay) : 1e3

  const freqs = []
  const mag = [], phaseRaw = []
  const magCL = [], phaseCLRaw = []

  for (let i = 0; i < N; i++) {
    const w = wMin * Math.pow(wMax / wMin, i / (N - 1))
    freqs.push(w)

    // Plant G(jw)
    const jw = { re: 0, im: w }
    const numVal = evalPolyComplex(num, jw)
    const denVal = evalPolyComplex(den, jw)
    const Gjw = complexDiv(numVal, denVal)

    // Delay: exp(-j*w*L) = cos(wL) - j*sin(wL)
    const delayVal = { re: Math.cos(w * delay), im: -Math.sin(w * delay) }
    const GjwD = complexMul(Gjw, delayVal)

    // PID: C(jw) = kp + ki/(jw) + kd*(jw)
    const Cjw = { re: kp, im: -ki / w + kd * w }

    // Open-loop L(jw) = C(jw) * G(jw)
    const Ljw = complexMul(Cjw, GjwD)
    const magVal = Math.sqrt(Ljw.re ** 2 + Ljw.im ** 2)
    mag.push(20 * Math.log10(Math.max(magVal, 1e-20)))
    phaseRaw.push(Math.atan2(Ljw.im, Ljw.re) * 180 / Math.PI)

    // Closed-loop H(jw) = L(jw) / (1 + L(jw))
    const Hjw = complexDiv(Ljw, { re: 1 + Ljw.re, im: Ljw.im })
    const magCLVal = Math.sqrt(Hjw.re ** 2 + Hjw.im ** 2)
    magCL.push(20 * Math.log10(Math.max(magCLVal, 1e-20)))
    phaseCLRaw.push(Math.atan2(Hjw.im, Hjw.re) * 180 / Math.PI)
  }

  // Unwrap both open-loop and closed-loop phase
  const phase   = unwrapPhase(phaseRaw)
  const phaseCL = unwrapPhase(phaseCLRaw)

  // Gain margin: first frequency where unwrapped open-loop phase crosses -180°
  let gainMargin = Infinity, gainMarginFreq = null
  for (let i = 1; i < N - 1; i++) {
    if (phase[i - 1] > -180 && phase[i] <= -180) {
      gainMargin = -mag[i]
      gainMarginFreq = freqs[i]
      break
    }
  }

  // Phase margin: first frequency where open-loop mag crosses 0 dB from above
  let phaseMargin = Infinity, phaseMarginFreq = null
  for (let i = 1; i < N - 1; i++) {
    if (mag[i - 1] > 0 && mag[i] <= 0) {
      phaseMargin = phase[i] + 180
      phaseMarginFreq = freqs[i]
      break
    }
  }

  return { freqs, mag, phase, magCL, phaseCL, gainMargin, phaseMargin, gainMarginFreq, phaseMarginFreq }
}

function evalPolyComplex(coeffs, s) {
  // poly = c0 + c1*s + c2*s^2 + ...
  let result = { re: 0, im: 0 }
  let sPow = { re: 1, im: 0 }
  for (let i = 0; i < coeffs.length; i++) {
    result.re += coeffs[i] * sPow.re
    result.im += coeffs[i] * sPow.im
    const nextSPow = complexMul(sPow, s)
    sPow = nextSPow
  }
  return result
}

function complexMul(a, b) {
  return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }
}

function complexDiv(a, b) {
  const denom = b.re ** 2 + b.im ** 2
  if (denom < 1e-30) return { re: 0, im: 0 }
  return { re: (a.re * b.re + a.im * b.im) / denom, im: (a.im * b.re - a.re * b.im) / denom }
}
