// Self-contained robustness Monte Carlo worker — all math inline

function simRK4(num, den, delay, kp, ki, kd, dt, T, uMin, uMax) {
  const r = 1
  let n = den.length - 1
  while (n > 0 && Math.abs(den[n]) < 1e-12) n--
  if (n === 0) {
    const gain = (num[0] || 0) / (den[0] || 1)
    const steps = Math.ceil(T / dt) + 1
    const t = [], y = []
    for (let i = 0; i < steps; i++) { t.push(i * dt); y.push(gain * r) }
    return { t, y }
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
  const t = [], y = []
  let ePrev = r

  for (let step = 0; step < steps; step++) {
    const ti = step * dt; t.push(ti)
    let plantY = 0
    for (let i = 0; i < n; i++) plantY += C[i] * state[i]
    let yFb = plantY
    if (delayBuf) {
      yFb = delayBuf[delayIdx]; delayBuf[delayIdx] = plantY
      delayIdx = (delayIdx + 1) % (delaySteps + 1)
    }
    y.push(plantY)
    const e = r - yFb
    const deDt = step === 0 ? 0 : (e - ePrev) / dt
    const uRaw = kp * e + ki * state[n] + kd * deDt
    const uOut = Math.max(uMin, Math.min(uMax, uRaw))
    ePrev = e
    if (step === steps - 1) break
    const deriv = (s, uc) => {
      const d = []
      for (let i = 0; i < n; i++) {
        let sum = 0
        for (let j = 0; j < n; j++) sum += A[i][j] * s[j]
        d.push(sum + B[i] * uc)
      }
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
  return { t, y }
}

function computePM(num, den, delay, kp, ki, kd) {
  const N = 200, wMin = 1e-3
  const wMax = delay > 0 ? Math.min(1e3, 10 / delay) : 1e3
  const mag = [], phRaw = []
  for (let i = 0; i < N; i++) {
    const w = wMin * Math.pow(wMax / wMin, i / (N - 1))
    let nr = 0, ni = 0, dr = 0, di = 0
    let powR = 1, powI = 0
    for (const c of num) {
      nr += c * powR; ni += c * powI
      const nR = -powI * w; const nI = powR * w
      powR = nR; powI = nI
    }
    powR = 1; powI = 0
    for (const c of den) {
      dr += c * powR; di += c * powI
      const nR = -powI * w; const nI = powR * w
      powR = nR; powI = nI
    }
    const denom = dr * dr + di * di || 1e-30
    const gR = (nr * dr + ni * di) / denom, gI = (ni * dr - nr * di) / denom
    const cosD = Math.cos(w * delay), sinD = Math.sin(w * delay)
    const gdR = gR * cosD + gI * sinD, gdI = gI * cosD - gR * sinD
    const cR = kp, cI = -ki / w + kd * w
    const lR = cR * gdR - cI * gdI, lI = cR * gdI + cI * gdR
    const mv = Math.sqrt(lR * lR + lI * lI)
    mag.push(20 * Math.log10(Math.max(mv, 1e-20)))
    phRaw.push(Math.atan2(lI, lR) * 180 / Math.PI)
  }
  const ph = [...phRaw]
  for (let i = 1; i < N; i++) {
    let d = ph[i] - ph[i - 1]
    while (d > 180) d -= 360
    while (d < -180) d += 360
    ph[i] = ph[i - 1] + d
  }
  for (let i = 1; i < N - 1; i++) {
    if (mag[i - 1] > 0 && mag[i] <= 0) return ph[i] + 180
  }
  return Infinity
}

function computeOvershoot(y, r = 1) {
  return Math.max(0, (Math.max(...y) - r) / r * 100)
}

self.onmessage = function({ data: msg }) {
  if (msg.type !== 'run') return
  const { num, den, delay, kp, ki, kd, dt, T, uMin, uMax, nSamples, variation } = msg.payload

  try {
    const vFrac = variation / 100
    // Active coefficient indices (non-zero denominator coefficients)
    const activeIdx = den.map((v, i) => Math.abs(v) > 1e-12 ? i : -1).filter(i => i >= 0)
    const activeNumIdx = num.map((v, i) => Math.abs(v) > 1e-12 ? i : -1).filter(i => i >= 0)

    const samples = []
    for (let s = 0; s < nSamples; s++) {
      const pertDen = [...den]
      const pertNum = [...num]

      // Independent uniform perturbation for each active coefficient
      const pertFracs = []
      activeIdx.forEach(i => {
        const f = (Math.random() * 2 - 1) * vFrac
        pertDen[i] = den[i] * (1 + f)
        pertFracs.push(Math.abs(f))
      })
      activeNumIdx.forEach(i => {
        const f = (Math.random() * 2 - 1) * vFrac
        pertNum[i] = num[i] * (1 + f)
        pertFracs.push(Math.abs(f))
      })

      const avgVar = pertFracs.length > 0
        ? pertFracs.reduce((a, b) => a + b, 0) / pertFracs.length * 100
        : 0

      let pm = -999, overshoot = null, stable = false
      try {
        const { y } = simRK4(pertNum, pertDen, delay, kp, ki, kd, dt, T, uMin, uMax)
        pm = computePM(pertNum, pertDen, delay, kp, ki, kd)
        if (pm === Infinity) pm = 999
        overshoot = computeOvershoot(y)
        stable = pm > 0 && Math.abs(y[y.length - 1] - 1) < 0.15
      } catch {}

      samples.push({ avgVar, pm, overshoot, stable })

      if (s % 10 === 9 || s === nSamples - 1) {
        self.postMessage({ type: 'progress', payload: { percent: Math.round((s + 1) / nSamples * 100) } })
      }
    }

    const stableCount = samples.filter(s => s.stable).length
    const unstable = samples.filter(s => !s.stable)
    const criticalVar = unstable.length > 0
      ? Math.min(...unstable.map(s => s.avgVar))
      : null

    const pmValues = samples.map(s => s.pm).filter(v => v > -900 && v < 900)
    const overshootVals = samples.map(s => s.overshoot).filter(v => v !== null)
    const avgVar = samples.map(s => s.avgVar)

    self.postMessage({
      type: 'result',
      payload: {
        samples,
        summary: {
          stableCount,
          totalCount: nSamples,
          stablePercent: Math.round(stableCount / nSamples * 100),
          minPM: pmValues.length ? Math.min(...pmValues).toFixed(1) : 'N/A',
          maxPM: pmValues.length ? Math.max(...pmValues).toFixed(1) : 'N/A',
          meanPM: pmValues.length ? (pmValues.reduce((a, b) => a + b, 0) / pmValues.length).toFixed(1) : 'N/A',
          minOvershoot: overshootVals.length ? Math.min(...overshootVals).toFixed(1) : 'N/A',
          maxOvershoot: overshootVals.length ? Math.max(...overshootVals).toFixed(1) : 'N/A',
          criticalVariation: criticalVar !== null ? criticalVar.toFixed(1) : `>${variation}`,
        }
      }
    })
  } catch (err) {
    self.postMessage({ type: 'error', payload: { message: err.message } })
  }
}
