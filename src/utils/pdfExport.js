import Plotly from 'plotly.js-dist-min'
import { simulate, computeSimParams } from '../math/simulation'
import { polynomialRoots } from '../store/useStore'

// ── Color palette (light / professional) ────────────────────────────────────
const C = {
  BLUE:       [59,  130, 246],
  BLUE_LIGHT: [219, 234, 254],
  WHITE:      [255, 255, 255],
  DARK:       [30,  41,  59],
  MED:        [71,  85,  105],
  TH_BG:      [226, 232, 240],
  ROW_ALT:    [248, 250, 252],
  GREEN:      [22,  163, 74],
  RED:        [220, 38,  38],
  WARN:       [180, 83,  9],
  GRAY:       [148, 163, 184],
}

const A4_W = 210, A4_H = 297, MARGIN = 15, TOTAL_PAGES = 6
const CW = A4_W - 2 * MARGIN   // 180 mm usable width

const pad2 = n => String(n).padStart(2, '0')

// ── Plotly chart render helpers ──────────────────────────────────────────────
const CHART_LAYOUT_BASE = {
  paper_bgcolor: '#ffffff',
  plot_bgcolor:  '#f8fafc',
  font: { color: '#1e293b', family: 'Helvetica, Arial, sans-serif', size: 13 },
  margin: { l: 70, r: 50, t: 20, b: 55 },
  xaxis: { gridcolor: '#e2e8f0', linecolor: '#94a3b8', tickcolor: '#64748b', zerolinecolor: '#cbd5e1' },
  yaxis: { gridcolor: '#e2e8f0', linecolor: '#94a3b8', tickcolor: '#64748b', zerolinecolor: '#cbd5e1' },
  legend: { bgcolor: 'rgba(255,255,255,0.9)', bordercolor: '#e2e8f0', borderwidth: 1 },
}

async function renderChart(traces, layoutOverride = {}, w = 1400, h = 560) {
  const div = document.createElement('div')
  div.style.cssText = `position:fixed;top:-9999px;left:-9999px;width:${w}px;height:${h}px;`
  document.body.appendChild(div)
  try {
    const layout = {
      ...CHART_LAYOUT_BASE,
      ...layoutOverride,
      xaxis: { ...CHART_LAYOUT_BASE.xaxis, ...(layoutOverride.xaxis || {}) },
      yaxis: { ...CHART_LAYOUT_BASE.yaxis, ...(layoutOverride.yaxis || {}) },
      ...(layoutOverride.yaxis2 ? { yaxis2: { ...CHART_LAYOUT_BASE.yaxis, ...layoutOverride.yaxis2 } } : {}),
    }
    await Plotly.newPlot(div, traces, layout, { staticPlot: true, responsive: false })
    return await Plotly.toImage(div, { format: 'png', width: w, height: h })
  } catch {
    return null
  } finally {
    try { Plotly.purge(div) } catch {}
    document.body.removeChild(div)
  }
}

// ── jsPDF drawing helpers ────────────────────────────────────────────────────
function makeHelpers(doc) {
  const fc  = (...c) => doc.setFillColor(...c)
  const tc  = (...c) => doc.setTextColor(...c)
  const dc  = (...c) => doc.setDrawColor(...c)
  const lw  = v => doc.setLineWidth(v)
  const fs  = v => doc.setFontSize(v)
  const ff  = (f, s) => doc.setFont('helvetica', s || 'normal')

  const pageHeader = (title) => {
    fc(...C.BLUE); doc.rect(0, 0, A4_W, 14, 'F')
    fs(11); ff(null, 'bold'); tc(...C.WHITE)
    doc.text(title, A4_W / 2, 9.5, { align: 'center' })
  }

  const sectionTitle = (txt, y) => {
    fs(14); ff(null, 'bold'); tc(...C.BLUE)
    doc.text(txt, MARGIN, y)
    dc(...C.BLUE_LIGHT); lw(0.4)
    doc.line(MARGIN, y + 1.5, A4_W - MARGIN, y + 1.5)
    return y + 8
  }

  const body = (txt, x, y, opts = {}) => {
    fs(opts.size || 10); ff(null, opts.bold ? 'bold' : 'normal')
    tc(...(opts.color || C.DARK))
    const lines = doc.splitTextToSize(txt, opts.maxW || CW)
    doc.text(lines, x, y, opts.align ? { align: opts.align } : {})
    return y + lines.length * (opts.lineH || 5.5)
  }

  const addFooter = (p) => {
    fs(8); ff(null, 'normal'); tc(...C.GRAY)
    doc.text(`Page ${p} of ${TOTAL_PAGES}`, A4_W / 2, A4_H - 7, { align: 'center' })
  }

  // Generic table: returns new y
  const table = (headers, rows, x, y, colWidths) => {
    const RH = 7, TW = colWidths.reduce((a, b) => a + b, 0)
    // Header row
    fc(...C.TH_BG); doc.rect(x, y, TW, RH, 'F')
    dc(...C.GRAY); lw(0.2); doc.rect(x, y, TW, RH, 'S')
    fs(9); ff(null, 'bold'); tc(...C.DARK)
    let cx = x
    headers.forEach((h, i) => { doc.text(String(h), cx + 2, y + 4.9); cx += colWidths[i] })
    y += RH
    rows.forEach((row, ri) => {
      fc(...(ri % 2 === 0 ? C.WHITE : C.ROW_ALT)); doc.rect(x, y, TW, RH, 'F')
      dc(...C.TH_BG); lw(0.1); doc.rect(x, y, TW, RH, 'S')
      fs(9); ff(null, 'normal')
      let cx = x
      row.forEach((cell, ci) => {
        const isObj = cell && typeof cell === 'object' && 'value' in cell
        tc(...(isObj ? (cell.color || C.MED) : C.MED))
        if (isObj && cell.bold) ff(null, 'bold')
        doc.text(String(isObj ? cell.value : cell), cx + 2, y + 4.9)
        if (isObj && cell.bold) ff(null, 'normal')
        cx += colWidths[ci]
      })
      y += RH
    })
    return y + 3
  }

  // Add a chart image; returns new y
  const addChart = (imgData, y, h) => {
    if (imgData) { doc.addImage(imgData, 'PNG', MARGIN, y, CW, h); return y + h + 3 }
    return y
  }

  return { pageHeader, sectionTitle, body, addFooter, table, addChart }
}

// ────────────────────────────────────────────────────────────────────────────
export async function generatePDF({ plant, criterion, optimizer, results }) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const { pageHeader, sectionTitle, body, addFooter, table, addChart } = makeHelpers(doc)

  const kp = results.kp ?? 0
  const ki = results.ki ?? 0
  const kd = results.kd ?? 0
  const metrics  = results.metrics  || {}
  const bodeData = results.freqData || {}
  const conv     = results.convergence || []

  const CRITERIA_LABELS = {
    w1: 'ITAE', w2: 'IAE', w3: 'ISE', w4: 'ITSE',
    w5: 'Overshoot', w6: 'Rise Time', w7: 'Settling Time', w8: 'Steady-state Error',
  }

  const now = new Date()
  const dateStr = `${pad2(now.getDate())}/${pad2(now.getMonth()+1)}/${now.getFullYear()} ${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`
  const fileDate = `${now.getFullYear()}-${pad2(now.getMonth()+1)}-${pad2(now.getDate())}`

  // ── Pre-render all charts ──────────────────────────────────────────────────

  const LINE_STYLE = { xaxis: { title: { text: '' } }, yaxis: { title: { text: '' } }, legend: { x: 0.99, y: 0.01, xanchor: 'right', yanchor: 'bottom' } }

  // Chart A: Open-loop step response
  let imgOL = null
  try {
    const { dt, T } = computeSimParams(plant.den, plant.delay)
    const olSim = simulate(plant.num, plant.den, plant.delay, 0, 0, 0, { dt, T, r: 1, openLoop: true })
    imgOL = await renderChart([
      { x: Array.from(olSim.t), y: Array.from(olSim.y), type: 'scatter', mode: 'lines', name: 'y(t)', line: { color: '#3b82f6', width: 2.5 } },
      { x: [olSim.t[0], olSim.t[olSim.t.length-1]], y: [1, 1], type: 'scatter', mode: 'lines', name: 'r(t)', line: { color: '#ef4444', width: 1.5 } },
    ], { xaxis: { title: { text: 'Time (s)' } }, yaxis: { title: { text: 'Output y(t)' } }, ...LINE_STYLE })
  } catch {}

  // Chart B: Pole-zero map
  let imgPZ = null
  let openLoopStable = true
  try {
    const activeDen = plant.den.slice(0, plant.order + 1)
    const n = activeDen.length - 1
    if (n > 0) {
      const an = activeDen[n]
      const poly = Array.from({ length: n + 1 }, (_, i) => activeDen[n - i] / an)
      const poles = polynomialRoots(poly)
      openLoopStable = poles.length > 0 && poles.every(p => p.re < -1e-9)
      const zeros = []
      const b0 = plant.num[0] ?? 0, b1 = plant.num[1] ?? 0
      if (Math.abs(b1) > 1e-12) zeros.push({ re: -b0 / b1, im: 0 })
      const traces = [
        { x: poles.map(p => p.re), y: poles.map(p => p.im), type: 'scatter', mode: 'markers', name: 'Poles', marker: { symbol: 'x', size: 14, color: '#ef4444', line: { width: 2.5 } } },
      ]
      if (zeros.length) traces.push({ x: zeros.map(z => z.re), y: zeros.map(z => z.im), type: 'scatter', mode: 'markers', name: 'Zeros', marker: { symbol: 'circle-open', size: 14, color: '#3b82f6', line: { width: 2.5 } } })
      imgPZ = await renderChart(traces, {
        xaxis: { title: { text: 'Real' }, zeroline: true, zerolinecolor: '#94a3b8', zerolinewidth: 1 },
        yaxis: { title: { text: 'Imaginary' }, zeroline: true, zerolinecolor: '#94a3b8', zerolinewidth: 1 },
        legend: { x: 0.99, y: 0.99, xanchor: 'right', yanchor: 'top' },
        margin: { l: 70, r: 40, t: 20, b: 55 },
      }, 1400, 480)
    }
  } catch {}

  // Chart C: Convergence
  let imgConv = null
  if (conv.length > 0) {
    const iters = conv.map((_, i) => i + 1)
    imgConv = await renderChart([
      { x: iters, y: conv, type: 'scatter', mode: 'markers', name: 'f<sub>OF</sub>', marker: { color: '#000000', size: 7 } },
    ], {
      xaxis: { title: { text: 'Iteration' } },
      yaxis: { title: { text: 'Objective Function (log scale)' }, type: 'log' },
    })
  }

  // Charts D & E: Step response and control signal (side by side)
  let imgStep = null, imgCtrl = null
  if (results.simData) {
    const sd = results.simData
    const tArr = Array.from(sd.t), yArr = Array.from(sd.y), uArr = Array.from(sd.u)
    imgStep = await renderChart([
      { x: tArr, y: yArr, type: 'scatter', mode: 'lines', name: 'y(t)', line: { color: '#3b82f6', width: 2.5 } },
      { x: [tArr[0], tArr[tArr.length-1]], y: [1, 1], type: 'scatter', mode: 'lines', name: 'Setpoint r(t)', line: { color: '#ef4444', width: 1.5 } },
    ], { xaxis: { title: { text: 'Time (s)' } }, yaxis: { title: { text: 'Output y(t)' } }, ...LINE_STYLE }, 900, 480)

    const ctrlTraces = [
      { x: tArr, y: uArr, type: 'scatter', mode: 'lines', name: 'u(t)', line: { color: '#8b5cf6', width: 2.5 } },
    ]
    if (criterion.useControlConstraint) {
      ctrlTraces.push({ x: [tArr[0], tArr[tArr.length-1]], y: [criterion.uMax, criterion.uMax], type: 'scatter', mode: 'lines', name: 'u_max', line: { color: '#ef4444', width: 1.5, dash: 'dash' } })
      ctrlTraces.push({ x: [tArr[0], tArr[tArr.length-1]], y: [criterion.uMin, criterion.uMin], type: 'scatter', mode: 'lines', name: 'u_min', line: { color: '#f59e0b', width: 1.5, dash: 'dash' } })
    }
    imgCtrl = await renderChart(ctrlTraces, {
      xaxis: { title: { text: 'Time (s)' } },
      yaxis: { title: { text: 'Control signal u(t)' } },
      ...LINE_STYLE,
    }, 900, 480)
  }

  // Chart F: Bode plot
  let imgBode = null
  if (bodeData.freqs) {
    imgBode = await renderChart([
      { x: bodeData.freqs, y: bodeData.magCL,   type: 'scatter', mode: 'lines', name: 'Magnitude (dB)', line: { color: '#3b82f6', width: 2.5 }, xaxis: 'x', yaxis: 'y' },
      { x: bodeData.freqs, y: bodeData.phaseCL,  type: 'scatter', mode: 'lines', name: 'Phase (°)',      line: { color: '#f59e0b', width: 2.5 }, xaxis: 'x', yaxis: 'y2' },
      { x: [bodeData.freqs[0], bodeData.freqs[bodeData.freqs.length-1]], y: [0, 0], mode: 'lines', line: { color: '#94a3b8', width: 1, dash: 'dot' }, xaxis: 'x', yaxis: 'y', showlegend: false },
    ], {
      margin: { l: 75, r: 75, t: 20, b: 55 },
      xaxis:  { type: 'log', title: { text: 'Frequency (rad/s)' } },
      yaxis:  { title: { text: 'Magnitude (dB)' }, side: 'left' },
      yaxis2: { title: { text: 'Phase (°)' }, side: 'right', overlaying: 'y' },
      legend: { x: 0.99, y: 0.99, xanchor: 'right', yanchor: 'top' },
    }, 1400, 600)
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PAGE 1 — TITLE PAGE
  // ════════════════════════════════════════════════════════════════════════════
  doc.setFillColor(...C.WHITE); doc.rect(0, 0, A4_W, A4_H, 'F')

  // Blue header band
  doc.setFillColor(...C.BLUE); doc.rect(0, 0, A4_W, 55, 'F')

  doc.setFontSize(22); doc.setFont('helvetica', 'bold'); doc.setTextColor(...C.WHITE)
  doc.text('PID Controller Tuning Report', A4_W / 2, 24, { align: 'center' })

  doc.setFontSize(13); doc.setFont('helvetica', 'normal'); doc.setTextColor(...C.BLUE_LIGHT)
  doc.text('Generated by PID Optimal Tuner  v1.0', A4_W / 2, 35, { align: 'center' })

  doc.setFontSize(10); doc.setTextColor(...C.BLUE_LIGHT)
  doc.text(dateStr, A4_W / 2, 44, { align: 'center' })

  // Divider
  let y = 70
  doc.setDrawColor(...C.BLUE); doc.setLineWidth(0.5)
  doc.line(MARGIN, y, A4_W - MARGIN, y)

  // Summary
  y += 10
  doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(...C.DARK)
  doc.text('Summary', MARGIN, y); y += 8

  const { dt: dt0, T: T0 } = computeSimParams(plant.den, plant.delay)
  y = table(
    ['Parameter', 'Value'],
    [
      ['Optimizer Algorithm',              optimizer.selected],
      ['Population (Agents)',              String(optimizer.population ?? 25)],
      ['Iterations',                       String(optimizer.iterations ?? 100)],
      ['Final Objective Function fOF',     results.finalCost != null ? results.finalCost.toExponential(4) : 'N/A'],
      ['Optimization Status',              results.allConstraintsMet ? 'All conditions satisfied' : 'Some conditions not met'],
      ['kp (parallel form)',               kp.toFixed(6)],
      ['ki (parallel form)',               ki.toFixed(6)],
      ['kd (parallel form)',               kd.toFixed(6)],
    ],
    MARGIN, y, [100, 80]
  )

  addFooter(1)

  // ════════════════════════════════════════════════════════════════════════════
  // PAGE 2 — PLANT MODEL
  // ════════════════════════════════════════════════════════════════════════════
  doc.addPage()
  doc.setFillColor(...C.WHITE); doc.rect(0, 0, A4_W, A4_H, 'F')
  pageHeader('Plant Model')

  y = 22
  y = sectionTitle('Plant Model', y)

  // Model source
  doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(...C.DARK)
  doc.text(`Model source: ${plant.method === 'tf' ? 'Transfer Function' : 'System Identification'}`, MARGIN, y)
  y += 7

  // G(s) symbolic
  const buildPoly = (coeffs, ord) => {
    const terms = []
    coeffs.slice(0, ord + 1).forEach((v, i) => {
      if (Math.abs(v) < 1e-12) return
      const base = v.toString()
      if (i === 0) terms.push(base)
      else if (i === 1) terms.push(`${base}·s`)
      else terms.push(`${base}·s^${i}`)
    })
    return terms.length ? terms.join(' + ') : '0'
  }
  const numOrd = plant.num.filter(v => Math.abs(v) > 1e-12).length > 0 ? plant.num.length - 1 : 0
  const numStr = buildPoly(plant.num, numOrd)
  const denStr = buildPoly(plant.den, plant.order)
  const delayStr = plant.delay > 0 ? ` · e^(-${plant.delay}s)` : ''

  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...C.DARK)
  const gLines = doc.splitTextToSize(`G(s) = (${numStr}) / (${denStr})${delayStr}`, CW)
  doc.text(gLines, MARGIN, y); y += gLines.length * 5 + 5

  // TF Coefficients table
  doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(...C.DARK)
  doc.text('Transfer Function Coefficients', MARGIN, y); y += 5

  const tfRows = []
  plant.num.slice(0, 3).forEach((v, i) => { if (i === 0 || Math.abs(v) > 1e-12) tfRows.push([`B${i}`, String(v)]) })
  plant.den.slice(0, plant.order + 1).forEach((v, i) => tfRows.push([`A${i}`, String(v)]))
  if (plant.delay > 0) tfRows.push(['L (delay)', `${plant.delay} s`])
  y = table(['Parameter', 'Value'], tfRows, MARGIN, y, [60, 120])

  // Simulation parameters
  doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(...C.DARK)
  doc.text('Simulation Parameters', MARGIN, y); y += 5
  y = table(['Parameter', 'Value'], [
    ['Integration step dt', `${dt0.toFixed(6)} s`],
    ['Simulation time T',   `${T0.toFixed(4)} s`],
  ], MARGIN, y, [90, 90])

  // Open-loop step response chart
  doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(...C.DARK)
  doc.text('Open-loop Step Response', MARGIN, y); y += 3
  y = addChart(imgOL, y, 57)

  // Pole-zero map
  doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(...C.DARK)
  doc.text('Pole-Zero Map', MARGIN, y); y += 3
  y = addChart(imgPZ, y, 50)

  // Stability indicator
  doc.setFontSize(10); doc.setFont('helvetica', 'bold')
  doc.setTextColor(...(openLoopStable ? C.GREEN : C.RED))
  doc.text(openLoopStable ? '✓ Stable open-loop system' : '⚠ Unstable open-loop system', MARGIN, y)

  addFooter(2)

  // ════════════════════════════════════════════════════════════════════════════
  // PAGE 3 — OPTIMIZATION SETUP
  // ════════════════════════════════════════════════════════════════════════════
  doc.addPage()
  doc.setFillColor(...C.WHITE); doc.rect(0, 0, A4_W, A4_H, 'F')
  pageHeader('Optimization Setup')

  y = 22
  y = sectionTitle('Optimization Setup', y)

  // Criterion formula
  const activeTerms = Object.entries(criterion.weights)
    .filter(([k]) => criterion.enabled[k] && criterion.weights[k] > 0)
    .map(([k, v]) => `${v.toFixed(2)}·${CRITERIA_LABELS[k] || k}`)
  const crFormula = activeTerms.length
    ? `Cr = ${activeTerms.join(' + ')} + Stability Penalty + Constraints Penalty`
    : 'Cr = 0 + Stability Penalty + Constraints Penalty'

  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...C.DARK)
  const crLines = doc.splitTextToSize(crFormula, CW)
  doc.text(crLines, MARGIN, y); y += crLines.length * 5 + 6

  // Performance Metrics table
  doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(...C.DARK)
  doc.text('Performance Metrics', MARGIN, y); y += 5
  const metricRows = Object.entries(criterion.weights)
    .filter(([k]) => criterion.enabled[k] && criterion.weights[k] > 0)
    .map(([k, v]) => [CRITERIA_LABELS[k] || k, v.toFixed(3)])
  if (!metricRows.length) metricRows.push(['(none selected)', '—'])
  y = table(['Criterion', 'Weight δ'], metricRows, MARGIN, y, [110, 70])

  // Constraints table
  doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(...C.DARK)
  doc.text('Constraints', MARGIN, y); y += 5
  const constraintRows = []
  if (criterion.useOvershootConstraint) constraintRows.push(['Allowable Overshoot', `${criterion.overshootMax} %`])
  if (criterion.useControlConstraint)  { constraintRows.push(['u_min', String(criterion.uMin)]); constraintRows.push(['u_max', String(criterion.uMax)]) }
  if (!constraintRows.length) constraintRows.push(['(no constraints enabled)', '—'])
  y = table(['Parameter', 'Value'], constraintRows, MARGIN, y, [110, 70])

  // PID Gain Search Bounds table
  doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(...C.DARK)
  doc.text('PID Gain Search Bounds', MARGIN, y); y += 5
  y = table(
    ['Parameter', 'Lower Bound', 'Upper Bound'],
    [
      ['kp', '0', String(optimizer.kpMax ?? 50)],
      ['ki', '0', String(optimizer.kiMax ?? 50)],
      ['kd', '0', String(optimizer.kdMax ?? 50)],
    ],
    MARGIN, y, [60, 60, 60]
  )

  // Optimizer Configuration table
  doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(...C.DARK)
  doc.text('Optimizer Configuration', MARGIN, y); y += 5
  y = table(
    ['Parameter', 'Value'],
    [
      ['Algorithm',          optimizer.selected],
      ['Agents (Population)', String(optimizer.population ?? 25)],
      ['Iterations',         String(optimizer.iterations ?? 100)],
    ],
    MARGIN, y, [110, 70]
  )

  addFooter(3)

  // ════════════════════════════════════════════════════════════════════════════
  // PAGE 4 — OPTIMIZATION CONVERGENCE
  // ════════════════════════════════════════════════════════════════════════════
  doc.addPage()
  doc.setFillColor(...C.WHITE); doc.rect(0, 0, A4_W, A4_H, 'F')
  pageHeader('Optimization Convergence')

  y = 22
  y = sectionTitle('Optimization Convergence', y)

  // Chart
  doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(...C.DARK)
  doc.text('Convergence Plot — Best Objective Function f₟OF vs. Iteration', MARGIN, y); y += 3
  y = addChart(imgConv, y, 85)

  // Results table
  doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(...C.DARK)
  doc.text('Convergence Results', MARGIN, y); y += 5
  y = table(
    ['Parameter', 'Value'],
    [
      ['Final objective function fOF', results.finalCost != null ? results.finalCost.toExponential(6) : 'N/A'],
      ['Optimization status',          results.allConstraintsMet ? 'Conditions satisfied' : 'Some conditions not met'],
    ],
    MARGIN, y, [110, 70]
  )
  y += 4

  // Status text
  doc.setFontSize(10); doc.setFont('helvetica', 'bold')
  doc.setTextColor(...(results.allConstraintsMet ? C.GREEN : C.RED))
  const statusText = results.allConstraintsMet
    ? '✓ Optimization complete. All tuning conditions satisfied.'
    : `⚠ Optimization complete. Some conditions were not satisfied:\n${results.statusMessage || ''}`
  const statusLines = doc.splitTextToSize(statusText, CW)
  doc.text(statusLines, MARGIN, y)

  addFooter(4)

  // ════════════════════════════════════════════════════════════════════════════
  // PAGE 5 — TUNING RESULTS: TIME DOMAIN
  // ════════════════════════════════════════════════════════════════════════════
  doc.addPage()
  doc.setFillColor(...C.WHITE); doc.rect(0, 0, A4_W, A4_H, 'F')
  pageHeader('Tuning Results — Time Domain')

  y = 22
  y = sectionTitle('Tuning Results — Time Domain', y)

  // PID Gains — two tables side by side
  doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(...C.DARK)
  doc.text('Optimized PID Gains', MARGIN, y); y += 5

  const halfW = (CW - 5) / 2
  const Ti = ki > 0 ? kp / ki : Infinity
  const Td = kp > 0 ? kd / kp : 0
  const RH = 7

  // Parallel Form (left)
  const parallelRows2 = [['kp', kp.toFixed(6)], ['ki', ki.toFixed(6)], ['kd', kd.toFixed(6)]]
  const startY = y
  doc.setFillColor(...C.TH_BG); doc.rect(MARGIN, y, halfW, RH, 'F')
  doc.setDrawColor(...C.GRAY); doc.setLineWidth(0.2); doc.rect(MARGIN, y, halfW, RH, 'S')
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...C.DARK)
  doc.text('Parallel Form', MARGIN + 2, y + 4.9); y += RH
  parallelRows2.forEach(([p, v], ri) => {
    doc.setFillColor(...(ri % 2 === 0 ? C.WHITE : C.ROW_ALT)); doc.rect(MARGIN, y, halfW, RH, 'F')
    doc.setDrawColor(...C.TH_BG); doc.setLineWidth(0.1); doc.rect(MARGIN, y, halfW, RH, 'S')
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(...C.MED)
    doc.text(p, MARGIN + 2, y + 4.9); doc.text(v, MARGIN + 30, y + 4.9); y += RH
  })

  // Standard Form (right)
  const rightX = MARGIN + halfW + 5
  const standardRows2 = [['Kp', kp.toFixed(6)], ['Ti', isFinite(Ti) ? `${Ti.toFixed(6)} s` : '∞'], ['Td', `${Td.toFixed(6)} s`]]
  let y2 = startY
  doc.setFillColor(...C.TH_BG); doc.rect(rightX, y2, halfW, RH, 'F')
  doc.setDrawColor(...C.GRAY); doc.setLineWidth(0.2); doc.rect(rightX, y2, halfW, RH, 'S')
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...C.DARK)
  doc.text('Standard Form', rightX + 2, y2 + 4.9); y2 += RH
  standardRows2.forEach(([p, v], ri) => {
    doc.setFillColor(...(ri % 2 === 0 ? C.WHITE : C.ROW_ALT)); doc.rect(rightX, y2, halfW, RH, 'F')
    doc.setDrawColor(...C.TH_BG); doc.setLineWidth(0.1); doc.rect(rightX, y2, halfW, RH, 'S')
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(...C.MED)
    doc.text(p, rightX + 2, y2 + 4.9); doc.text(v, rightX + 30, y2 + 4.9); y2 += RH
  })
  y = Math.max(y, y2) + 5

  // Step response + control signal side by side
  const chartHalf = (CW - 4) / 2
  const CHART_H = 60
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...C.DARK)
  doc.text('Closed-loop Step Response y(t)', MARGIN, y); y += 2
  if (imgStep) doc.addImage(imgStep, 'PNG', MARGIN, y, chartHalf, CHART_H)
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...C.DARK)
  doc.text('Control Signal u(t)', MARGIN + chartHalf + 4, y - 2)
  if (imgCtrl) doc.addImage(imgCtrl, 'PNG', MARGIN + chartHalf + 4, y, chartHalf, CHART_H)
  y += CHART_H + 5

  // Performance Metrics table
  doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(...C.DARK)
  doc.text('Performance Metrics', MARGIN, y); y += 5
  y = table(
    ['Metric', 'Value'],
    [
      ['ITAE',               (metrics.ITAE        ?? 0).toFixed(6)],
      ['IAE',                (metrics.IAE         ?? 0).toFixed(6)],
      ['ISE',                (metrics.ISE         ?? 0).toFixed(6)],
      ['ITSE',               (metrics.ITSE        ?? 0).toFixed(6)],
      ['Overshoot',          `${(metrics.overshoot   ?? 0).toFixed(2)} %`],
      ['Rise Time',          `${(metrics.riseTime    ?? 0).toFixed(4)} s`],
      ['Settling Time',      `${(metrics.settlingTime?? 0).toFixed(4)} s`],
      ['Steady-state Error', (metrics.ess         ?? 0).toFixed(6)],
    ],
    MARGIN, y, [110, 70]
  )

  addFooter(5)

  // ════════════════════════════════════════════════════════════════════════════
  // PAGE 6 — FREQUENCY DOMAIN
  // ════════════════════════════════════════════════════════════════════════════
  doc.addPage()
  doc.setFillColor(...C.WHITE); doc.rect(0, 0, A4_W, A4_H, 'F')
  pageHeader('Frequency Domain Analysis')

  y = 22
  y = sectionTitle('Frequency Domain Analysis', y)

  // Bode chart
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...C.DARK)
  doc.text('Closed-loop Bode Plot  H(jω) = C(jω)·G(jω) / (1 + C(jω)·G(jω))', MARGIN, y); y += 3
  y = addChart(imgBode, y, 87)

  // Stability Margins table
  doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(...C.DARK)
  doc.text('Stability Margins', MARGIN, y); y += 5

  const gm = bodeData.gainMargin
  const pm = bodeData.phaseMargin
  const gmOk = isFinite(gm) ? gm > 6 : true
  const pmGood = isFinite(pm) ? pm > 45 : true
  const pmAccept = isFinite(pm) ? pm >= 30 : true

  const gmStatus = gmOk ? { value: '✓', color: C.GREEN } : { value: '⚠', color: C.WARN }
  const pmStatus = pmGood ? { value: '✓', color: C.GREEN } : pmAccept ? { value: '⚠', color: C.WARN } : { value: '✗', color: C.RED }

  y = table(
    ['Parameter', 'Value', 'Status'],
    [
      ['Gain Margin',     isFinite(gm) ? `${gm.toFixed(2)} dB` : '∞',           gmStatus],
      ['Phase Margin',    isFinite(pm) ? `${pm.toFixed(2)} °`  : '∞',           pmStatus],
      ['Crossover Freq',  bodeData.phaseMarginFreq ? `${bodeData.phaseMarginFreq.toFixed(3)} rad/s` : 'N/A', { value: '—', color: C.MED }],
      ['Phase Crossover', bodeData.gainMarginFreq  ? `${bodeData.gainMarginFreq.toFixed(3)} rad/s`  : 'N/A', { value: '—', color: C.MED }],
    ],
    MARGIN, y, [80, 60, 40]
  )
  y += 3

  // Phase margin comment
  let pmComment, pmColor
  if (!isFinite(pm) || pm > 45)  { pmColor = C.GREEN; pmComment = '✓ Good — adequate stability margin' }
  else if (pm >= 30)              { pmColor = C.WARN;  pmComment = '⚠ Acceptable — consider re-tuning for better stability' }
  else                            { pmColor = C.RED;   pmComment = '✗ Poor — system may be poorly damped, re-tuning recommended' }

  doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(...pmColor)
  doc.text(`Phase Margin: ${pmComment}`, MARGIN, y)

  addFooter(6)

  // ── Save ──────────────────────────────────────────────────────────────────
  doc.save(`PID_Tuning_Report_${fileDate}.pdf`)
}
