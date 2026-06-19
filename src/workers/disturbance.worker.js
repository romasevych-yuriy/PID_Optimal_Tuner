// Self-contained disturbance simulation worker — all math inline

function simRK4withDisturbance(num, den, delay, kp, ki, kd, dt, T, uMin, uMax, dist) {
  const { type, point, amplitude, tOnset, sineFreq = 1 } = dist
  const r = 1

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
  const A = []
  for (let i = 0; i < n; i++) {
    const row = new Float64Array(n)
    if (i < n - 1) row[i + 1] = 1
    else for (let j = 0; j < n; j++) row[j] = -den[j] / an
    A.push(row)
  }
  const B = new Float64Array(n); B[n - 1] = 1 / an
  const C = new Float64Array(n)
  for (let i = 0; i < Math.min(num.length, n); i++) C[i] = num[i] / an

  const steps = Math.ceil(T / dt) + 1
  const state = new Float64Array(n + 1)
  const delaySteps = delay > 0 ? Math.round(delay / dt) : 0
  const delayBuf = delaySteps > 0 ? new Float64Array(delaySteps + 1) : null
  let delayIdx = 0

  const t = [], y = [], u = []
  let ePrev = r

  function getD(ti) {
    if (ti < tOnset - 0.5 * dt) return 0
    const tau = ti - tOnset
    if (type === 'step')    return amplitude
    if (type === 'impulse') return (tau >= 0 && tau < dt) ? amplitude / dt : 0
    if (type === 'sine')    return amplitude * Math.sin(2 * Math.PI * sineFreq * Math.max(tau, 0))
    return 0
  }

  for (let step = 0; step < steps; step++) {
    const ti = step * dt
    t.push(ti)

    let plantY = 0
    for (let i = 0; i < n; i++) plantY += C[i] * state[i]

    let yFb = plantY
    if (delayBuf) {
      yFb = delayBuf[delayIdx]
      delayBuf[delayIdx] = plantY
      delayIdx = (delayIdx + 1) % (delaySteps + 1)
    }

    const d = getD(ti)
    // For output disturbance: d is added to measured output (what controller sees)
    // For input disturbance: d is added to plant input (after controller)
    const ySys = point === 'output' ? yFb + d : yFb
    y.push(ySys)

    const e = r - ySys
    const deDt = step === 0 ? 0 : (e - ePrev) / dt
    const uRaw = kp * e + ki * state[n] + kd * deDt
    const uCtrl = Math.max(uMin, Math.min(uMax, uRaw))
    u.push(uCtrl)
    ePrev = e

    if (step === steps - 1) break

    const uPlant = point === 'input' ? uCtrl + d : uCtrl

    const deriv = (s, uc) => {
      const res = []
      for (let i = 0; i < n; i++) {
        let sum = 0
        for (let j = 0; j < n; j++) sum += A[i][j] * s[j]
        res.push(sum + B[i] * uc)
      }
      let py = 0
      for (let i = 0; i < n; i++) py += C[i] * s[i]
      res.push(r - (delayBuf ? ySys : (point === 'output' ? py + d : py)))
      return res
    }

    const k1 = deriv(state, uPlant)
    const s2 = state.map((v, i) => v + 0.5 * dt * k1[i])
    const k2 = deriv(s2, uPlant)
    const s3 = state.map((v, i) => v + 0.5 * dt * k2[i])
    const k3 = deriv(s3, uPlant)
    const s4 = state.map((v, i) => v + dt * k3[i])
    const k4 = deriv(s4, uPlant)
    for (let i = 0; i <= n; i++) {
      state[i] += (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i])
    }
  }

  return { t, y, u }
}

self.onmessage = function({ data: msg }) {
  if (msg.type !== 'run') return
  const { num, den, delay, kp, ki, kd, dt, T, uMin = -Infinity, uMax = Infinity, disturbance } = msg.payload

  try {
    const { t, y, u } = simRK4withDisturbance(num, den, delay, kp, ki, kd, dt, T, uMin, uMax, disturbance)

    const r = 1
    const tOnset = disturbance.tOnset
    const band = 0.02

    // Disturbance onset index
    const idxOnset = t.findIndex(ti => ti >= tOnset - 0.5 * (t[1] - t[0]))
    const yAfter = idxOnset >= 0 ? y.slice(idxOnset) : y
    const tAfter = idxOnset >= 0 ? t.slice(idxOnset) : t

    const maxDev = Math.max(...yAfter.map(v => Math.abs(v - r)), 0)

    let recoveryTime = T - tOnset
    for (let i = yAfter.length - 1; i >= 0; i--) {
      if (Math.abs(yAfter[i] - r) > band) {
        recoveryTime = (tAfter[Math.min(i + 1, tAfter.length - 1)] ?? T) - tOnset
        break
      }
      if (i === 0) recoveryTime = 0
    }

    const ssLen = Math.max(1, Math.floor(yAfter.length * 0.1))
    const ssY = yAfter.slice(-ssLen).reduce((a, b) => a + b, 0) / ssLen
    const ssErr = Math.abs(r - ssY)

    self.postMessage({
      type: 'result',
      payload: {
        t, y, u,
        metrics: {
          maxDeviation: maxDev,
          recoveryTime: Math.max(0, recoveryTime),
          steadyStateError: ssErr,
        }
      }
    })
  } catch (err) {
    self.postMessage({ type: 'error', payload: { message: err.message } })
  }
}
