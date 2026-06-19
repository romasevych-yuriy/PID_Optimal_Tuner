// Self-contained sensitivity analysis worker — all math inline

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

function computeMetrics(t, y, T) {
  const n = t.length, dt = n > 1 ? t[1] - t[0] : 0.01, r = 1
  const lastIdx = Math.floor(0.9 * n)
  let ssSum = 0, ssCount = 0
  for (let i = lastIdx; i < n; i++) { ssSum += y[i]; ssCount++ }
  const ySS = ssCount > 0 ? ssSum / ssCount : y[n - 1]
  const yMax = Math.max(...y)
  const overshoot = Math.max(0, (yMax - r) / r * 100)
  let t10 = 0, t90 = 0
  for (let i = 1; i < n; i++) {
    if (y[i - 1] < 0.1 && y[i] >= 0.1 && t10 === 0) t10 = t[i]
    if (y[i - 1] < 0.9 && y[i] >= 0.9 && t90 === 0) t90 = t[i]
  }
  const riseTime = Math.max(0, t90 - t10)
  const band = 0.02
  let settlingTime = T
  for (let i = n - 1; i >= 0; i--) {
    if (Math.abs(y[i] - r) > band) { settlingTime = i < n - 1 ? t[i + 1] : T; break }
    if (i === 0) settlingTime = 0
  }
  const ess = Math.abs(r - ySS)
  let ITAE = 0, IAE = 0, ISE = 0, ITSE = 0
  for (let i = 0; i < n; i++) {
    const e = Math.abs(r - y[i])
    ITAE += t[i] * e * dt; IAE += e * dt
    ISE += e * e * dt; ITSE += t[i] * e * e * dt
  }
  return { ITAE, IAE, ISE, ITSE, overshoot, riseTime, settlingTime, ess }
}

function computeCr(metrics, criterion, T) {
  const { weights: w, enabled: e } = criterion
  const { ITAE, IAE, ISE, ITSE, overshoot, riseTime, settlingTime, ess } = metrics
  const T2h = T * T / 2
  let Cr = 0
  if (e.w1) Cr += w.w1 * ITAE / T2h
  if (e.w2) Cr += w.w2 * IAE / T
  if (e.w3) Cr += w.w3 * ISE / T
  if (e.w4) Cr += w.w4 * ITSE / T2h
  if (e.w5) Cr += w.w5 * overshoot / 100
  if (e.w6) Cr += w.w6 * riseTime / T
  if (e.w7) Cr += w.w7 * settlingTime / T
  if (e.w8) Cr += w.w8 * ess
  return Cr
}

// Evaluate polynomial at jw: returns { re, im }
function evalPoly(coeffs, w) {
  let re = 0, im = 0, powR = 1, powI = 0
  for (const c of coeffs) {
    re += c * powR; im += c * powI
    const nR = -powI * w; const nI = powR * w
    powR = nR; powI = nI
  }
  return { re, im }
}

function computePM(num, den, delay, kp, ki, kd) {
  const N = 300, wMin = 1e-3
  const wMax = delay > 0 ? Math.min(1e3, 10 / delay) : 1e3
  const mag = [], phRaw = []
  for (let i = 0; i < N; i++) {
    const w = wMin * Math.pow(wMax / wMin, i / (N - 1))
    const { re: nr, im: ni } = evalPoly(num, w)
    const { re: dr, im: di } = evalPoly(den, w)
    const denom = dr * dr + di * di || 1e-30
    const gR = (nr * dr + ni * di) / denom, gI = (ni * dr - nr * di) / denom
    const cosD = Math.cos(w * delay), sinD = Math.sin(w * delay)
    const gdR = gR * cosD + gI * sinD, gdI = gI * cosD - gR * sinD
    const cI = -ki / w + kd * w
    const lR = kp * gdR - cI * gdI, lI = kp * gdI + cI * gdR
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

self.onmessage = function({ data: msg }) {
  if (msg.type !== 'run') return
  const { num, den, delay, kp, ki, kd, dt, T, uMin, uMax,
          paramIndices, variation, nPoints, criterion, includeMetrics } = msg.payload

  try {
    const nomSim = simRK4(num, den, delay, kp, ki, kd, dt, T, uMin, uMax)
    const nomMetrics = computeMetrics(nomSim.t, nomSim.y, T)
    const nomFOF = computeCr(nomMetrics, criterion, T)
    const nomPM = includeMetrics.includes('phaseMargin')
      ? computePM(num, den, delay, kp, ki, kd) : null

    // Variation percentages array
    const vars = []
    for (let i = 0; i < nPoints; i++) {
      vars.push(nPoints > 1 ? -variation + (2 * variation / (nPoints - 1)) * i : 0)
    }

    const results = paramIndices.map(idx => {
      const nomVal = den[idx]
      if (Math.abs(nomVal) < 1e-12) {
        return { idx, name: `A${idx}`, nomVal, fofDeltas: vars.map(() => 0), metricsData: {}, influence: 0, stable: true }
      }

      const fofDeltas = []
      const metricsData = {}
      includeMetrics.forEach(k => { metricsData[k] = [] })

      vars.forEach(vPct => {
        const pertDen = [...den]
        pertDen[idx] = nomVal * (1 + vPct / 100)
        try {
          const sim = simRK4(num, pertDen, delay, kp, ki, kd, dt, T, uMin, uMax)
          const m = computeMetrics(sim.t, sim.y, T)
          const fof = computeCr(m, criterion, T)
          fofDeltas.push(nomFOF > 1e-12 ? (fof - nomFOF) / nomFOF * 100 : 0)
          includeMetrics.forEach(k => {
            if (k === 'phaseMargin') {
              const pm = computePM(num, pertDen, delay, kp, ki, kd)
              const pmVal = pm === Infinity ? 180 : pm
              const base = (nomPM != null && isFinite(nomPM) && Math.abs(nomPM) > 0.1) ? nomPM : null
              metricsData[k].push(base != null ? (pmVal - base) / Math.abs(base) * 100 : pmVal)
            } else if (k in m) {
              const base = nomMetrics[k]
              metricsData[k].push(Math.abs(base) > 1e-12 ? m[k] / base * 100 - 100 : 0)
            } else {
              metricsData[k].push(0)
            }
          })
        } catch {
          fofDeltas.push(0)
          includeMetrics.forEach(k => metricsData[k].push(null))
        }
      })

      const influence = Math.max(...fofDeltas.map(v => Math.abs(v ?? 0)), 0)
      return { idx, name: `A${idx}`, nomVal, fofDeltas, metricsData, influence, stable: true }
    })

    self.postMessage({
      type: 'result',
      payload: { vars, params: results, nominalFOF: nomFOF, nominalPM: nomPM, nominalMetrics: nomMetrics }
    })
  } catch (err) {
    self.postMessage({ type: 'error', payload: { message: err.message } })
  }
}
