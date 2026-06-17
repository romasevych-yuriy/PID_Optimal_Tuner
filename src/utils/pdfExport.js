import Plotly from 'plotly.js-dist-min'
import { simulate, computeSimParams } from '../math/simulation'
import { polynomialRoots } from '../store/useStore'

// ── Color palette ────────────────────────────────────────────────────────────
const C = {
  BLUE:    [59,  130, 246],
  BL_LT:   [219, 234, 254],
  WHITE:   [255, 255, 255],
  DARK:    [30,  41,  59],
  MED:     [71,  85,  105],
  TH_BG:   [226, 232, 240],
  ROW_ALT: [248, 250, 252],
  GREEN:   [22,  163, 74],
  RED:     [220, 38,  38],
  WARN:    [180, 83,  9],
  GRAY:    [148, 163, 184],
}

const A4_W = 210, A4_H = 297, M = 15, CW = A4_W - 2 * M
const TOTAL = 6
const RH = 10    // table row height mm
const FS = {     // font sizes pt
  SEC: 20,       // section title
  LBL: 13,       // label / body
  TAB: 12,       // table content
  SUB: 7.8,      // subscript (65% of TAB)
}
const SUB_DY = FS.TAB * 0.35 * 0.353  // subscript vertical offset: pt → mm

const pad2 = n => String(n).padStart(2, '0')

// ── App-matching Plotly chart theme (mirrors DARK_LAYOUT from PlotlyChart.jsx)
const APP = {
  paper_bgcolor: '#edf0f6',
  plot_bgcolor:  '#edf0f6',
  font: { color: '#374151', family: 'Inter, system-ui, sans-serif', size: 14 },
  xaxis: { gridcolor: '#b8c4d8', linecolor: '#9ca3af', tickcolor: '#6b7280',
           zerolinecolor: '#b8c4d8', showline: true, mirror: true, linewidth: 1.5 },
  yaxis: { gridcolor: '#b8c4d8', linecolor: '#9ca3af', tickcolor: '#6b7280',
           zerolinecolor: '#b8c4d8', showline: true, mirror: true, linewidth: 1.5 },
  legend: { bgcolor: 'rgba(237,240,246,0.9)', bordercolor: '#b8c4d8', borderwidth: 1, font: { size: 15 } },
}

async function renderChart(traces, layoutOverride = {}, w = 1400, h = 520) {
  const div = document.createElement('div')
  div.style.cssText = `position:fixed;top:-9999px;left:-9999px;width:${w}px;height:${h}px;`
  document.body.appendChild(div)
  try {
    const lo = {
      ...APP,
      ...layoutOverride,
      xaxis:  { ...APP.xaxis,  ...(layoutOverride.xaxis  || {}) },
      yaxis:  { ...APP.yaxis,  ...(layoutOverride.yaxis  || {}) },
      legend: { ...APP.legend, ...(layoutOverride.legend || {}) },
      ...(layoutOverride.yaxis2 ? { yaxis2: { ...APP.yaxis, ...layoutOverride.yaxis2 } } : {}),
    }
    await Plotly.newPlot(div, traces, lo, { staticPlot: true, responsive: false })
    return await Plotly.toImage(div, { format: 'png', width: w, height: h })
  } catch { return null }
  finally { try { Plotly.purge(div) } catch {}; document.body.removeChild(div) }
}

// ────────────────────────────────────────────────────────────────────────────
export async function generatePDF({ plant, criterion, optimizer, results }) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  // ── jsPDF helpers ──────────────────────────────────────────────────────────
  const fc = (...c) => doc.setFillColor(...c)
  const tc = (...c) => doc.setTextColor(...c)
  const dc = (...c) => doc.setDrawColor(...c)
  const lw = v  => doc.setLineWidth(v)
  const fs = v  => doc.setFontSize(v)
  const fb = ()  => doc.setFont('helvetica', 'bold')
  const fn = ()  => doc.setFont('helvetica', 'normal')

  // Page header bar (blue)
  const pageHeader = title => {
    fc(...C.BLUE); doc.rect(0, 0, A4_W, 14, 'F')
    fs(11); fb(); tc(...C.WHITE)
    doc.text(title, A4_W / 2, 9.5, { align: 'center' })
  }

  // Section heading with underline
  const secTitle = (txt, y) => {
    fs(FS.SEC); fb(); tc(...C.BLUE)
    doc.text(txt, M, y)
    dc(...C.BL_LT); lw(0.4)
    doc.line(M, y + 1.5, A4_W - M, y + 1.5)
    return y + 10
  }

  // Body text with optional wrap; returns next y
  const bodyText = (txt, x, y, opts = {}) => {
    fs(opts.size || FS.LBL); opts.bold ? fb() : fn()
    tc(...(opts.color || C.DARK))
    const lines = doc.splitTextToSize(txt, opts.maxW || CW)
    doc.text(lines, x, y)
    return y + lines.length * (opts.lh || 6)
  }

  // Draw subscript text: mainText + smaller sub below-right
  // Returns the right x edge (approximate)
  const drawSub = (main, sub, x, y, color = C.MED) => {
    fs(FS.TAB); fn(); tc(...color)
    doc.text(main, x, y)
    const mw = doc.getTextWidth(main)
    fs(FS.SUB)
    doc.text(sub, x + mw, y + SUB_DY)
    const sw = doc.getTextWidth(sub)
    fs(FS.TAB)
    return x + mw + sw
  }

  // Add chart image; returns new y
  const addImg = (img, y, h) => {
    if (img) { doc.addImage(img, 'PNG', M, y, CW, h); return y + h + 3 }
    return y
  }

  // Footer
  const footer = p => {
    fs(8); fn(); tc(...C.GRAY)
    doc.text(`Page ${p} of ${TOTAL}`, A4_W / 2, A4_H - 7, { align: 'center' })
  }

  // Generic table; cell may be: string | {value,color} | {text,sub,color}
  const drawTable = (headers, rows, x, y, colW) => {
    const TW = colW.reduce((a, b) => a + b, 0)
    const drawRow = (cells, isHeader, rowIdx) => {
      if (isHeader) { fc(...C.TH_BG) } else { fc(...(rowIdx % 2 === 0 ? C.WHITE : C.ROW_ALT)) }
      doc.rect(x, y, TW, RH, 'F')
      dc(...C.GRAY); lw(0.15); doc.rect(x, y, TW, RH, 'S')
      let cx = x
      cells.forEach((cell, ci) => {
        const isObj = cell && typeof cell === 'object'
        if (isHeader) {
          fs(FS.TAB); fb(); tc(...C.DARK)
          doc.text(String(isObj ? (cell.value || cell.text || '') : cell), cx + 2, y + RH * 0.6)
        } else if (isObj && 'text' in cell && 'sub' in cell) {
          drawSub(cell.text, cell.sub, cx + 2, y + RH * 0.6, cell.color || C.MED)
        } else if (isObj && 'value' in cell) {
          fs(FS.TAB); fn(); tc(...(cell.color || C.MED))
          if (cell.bold) fb()
          doc.text(String(cell.value), cx + 2, y + RH * 0.6)
          fn()
        } else {
          fs(FS.TAB); fn(); tc(...C.MED)
          doc.text(String(cell ?? ''), cx + 2, y + RH * 0.6)
        }
        cx += colW[ci]
      })
    }
    drawRow(headers, true, -1); y += RH
    rows.forEach((row, ri) => { drawRow(row, false, ri); y += RH })
    return y + 3
  }

  // ── Data shortcuts ─────────────────────────────────────────────────────────
  const kp = results.kp ?? 0
  const ki = results.ki ?? 0
  const kd = results.kd ?? 0
  const met = results.metrics  || {}
  const bd  = results.freqData || {}
  const conv = results.convergence || []

  const CRIT_LBL = {
    w1: 'ITAE', w2: 'IAE', w3: 'ISE', w4: 'ITSE',
    w5: 'Overshoot', w6: 'Rise Time', w7: 'Settling Time', w8: 'Steady-state Error',
  }

  const now = new Date()
  const dateStr = `${pad2(now.getDate())}/${pad2(now.getMonth()+1)}/${now.getFullYear()}  ${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`
  const fileDateStr = `${now.getFullYear()}-${pad2(now.getMonth()+1)}-${pad2(now.getDate())}`

  const { dt, T } = computeSimParams(plant.den, plant.delay)

  // ── Pre-render all charts ──────────────────────────────────────────────────

  // Chart A — open-loop step response (matches ModelPage tf-preview)
  let imgOL = null
  try {
    const olSim = simulate(plant.num, plant.den, plant.delay, 0, 0, 0,
      { dt, T, r: 1, openLoop: true })
    const tArr = Array.from(olSim.t)
    imgOL = await renderChart([
      { x: tArr, y: Array.from(olSim.y), type: 'scatter', mode: 'lines',
        name: '<b>y(t) — step response</b>', line: { color: '#3b82f6', width: 3 } },
      { x: tArr, y: tArr.map(() => 1), type: 'scatter', mode: 'lines',
        name: '<b>r(t) — setpoint</b>', line: { color: '#ef4444', width: 2 } },
    ], {
      title: { text: '<b>Open-loop Step Response</b>', font: { size: 16 } },
      xaxis: { title: { text: 'Time (s)', font: { size: 14 } }, tickfont: { size: 13 }, range: [0, T] },
      yaxis: { title: { text: 'Output y(t) / Setpoint r(t)', font: { size: 14 } }, tickfont: { size: 13 }, autorange: true },
      legend: { x: 0.99, y: 0.01, xanchor: 'right', yanchor: 'bottom' },
      margin: { l: 70, r: 40, t: 50, b: 55 },
    })
  } catch {}

  // Chart B — pole-zero map (matches ModelPage pz-map)
  let imgPZ = null
  let olStable = true
  let poles = [], pzeros = []
  try {
    const activeDen = plant.den.slice(0, plant.order + 1)
    const n = activeDen.length - 1
    if (n > 0) {
      const an = activeDen[n]
      const poly = Array.from({ length: n + 1 }, (_, i) => activeDen[n - i] / an)
      poles = polynomialRoots(poly)
      olStable = poles.length > 0 && poles.every(p => p.re < -1e-9)
      const b0 = plant.num[0] ?? 0, b1 = plant.num[1] ?? 0
      if (Math.abs(b1) > 1e-12) pzeros.push({ re: -b0 / b1, im: 0 })
    }
    const traces = [
      { x: pzeros.map(z => z.re), y: pzeros.map(z => z.im), type: 'scatter', mode: 'markers',
        name: '<b>Zeros</b>', marker: { symbol: 'circle-open', size: 14, color: '#3b82f6', line: { width: 2.5 } } },
      { x: poles.map(p => p.re), y: poles.map(p => p.im), type: 'scatter', mode: 'markers',
        name: '<b>Poles</b>', marker: { symbol: 'x', size: 14, color: '#ef4444', line: { width: 2.5 } } },
    ]
    imgPZ = await renderChart(traces, {
      title: { text: '<b>Pole-Zero Map</b>', font: { size: 16 } },
      xaxis: { title: { text: 'Real (Re)', font: { size: 14 } }, tickfont: { size: 13 }, zeroline: false },
      yaxis: { title: { text: 'Imaginary (Im)', font: { size: 14 } }, tickfont: { size: 13 }, zeroline: false },
      shapes: [
        { type: 'line', x0: 0, x1: 0, y0: 0, y1: 1, xref: 'x', yref: 'paper', line: { color: '#9ca3af', dash: 'dash', width: 1.5 } },
        { type: 'line', x0: 0, x1: 1, y0: 0, y1: 0, xref: 'paper', yref: 'y', line: { color: '#9ca3af', dash: 'dash', width: 1.5 } },
      ],
      legend: { x: 0.99, y: 0.01, xanchor: 'right', yanchor: 'bottom' },
      margin: { l: 70, r: 40, t: 50, b: 55 },
    }, 1400, 480)
  } catch {}

  // Chart C — convergence (matches OptimizerPage convergence chart)
  let imgConv = null
  if (conv.length > 0) {
    try {
      imgConv = await renderChart([
        { x: conv.map((_, i) => i + 1), y: conv, type: 'scatter', mode: 'markers',
          name: 'f<sub>OF</sub>', marker: { color: '#000000', size: 9 } },
      ], {
        xaxis: { title: { text: 'Iteration', font: { size: 14 } }, tickfont: { size: 13 } },
        yaxis: { title: { text: 'f_OF (logarithmic scale)', font: { size: 14 } },
                 tickfont: { size: 13 }, type: 'log', autorange: true },
        legend: { x: 0.99, y: 0.99, xanchor: 'right', yanchor: 'top' },
        margin: { l: 70, r: 40, t: 10, b: 55 },
      })
    } catch {}
  }

  // Charts D & E — step response + control signal (match ResultsPage)
  let imgStep = null, imgCtrl = null
  if (results.simData) {
    const sd = results.simData
    const tA = Array.from(sd.t), yA = Array.from(sd.y), uA = Array.from(sd.u)
    try {
      imgStep = await renderChart([
        { x: tA, y: yA, type: 'scatter', mode: 'lines', name: 'y(t)',
          line: { color: '#3b82f6', width: 3 } },
        { x: [tA[0], tA[tA.length-1]], y: [1, 1], type: 'scatter', mode: 'lines',
          name: 'Setpoint r(t)', line: { color: '#ef4444', width: 1.5 } },
      ], {
        xaxis: { title: { text: 'Time (s)', font: { size: 14 } }, tickfont: { size: 13 } },
        yaxis: { title: { text: 'Output y(t)', font: { size: 14 } }, tickfont: { size: 13 }, autorange: true },
        legend: { x: 0.99, y: 0.01, xanchor: 'right', yanchor: 'bottom' },
        margin: { l: 70, r: 40, t: 10, b: 55 },
      }, 900, 480)
    } catch {}
    try {
      const ctrlTraces = [
        { x: tA, y: uA, type: 'scatter', mode: 'lines', name: 'u(t)',
          line: { color: '#8b5cf6', width: 3 } },
      ]
      if (criterion.useControlConstraint) {
        ctrlTraces.push({ x: [tA[0], tA[tA.length-1]], y: [criterion.uMax, criterion.uMax],
          type: 'scatter', mode: 'lines', name: 'u<sub>max</sub>',
          line: { color: '#ef4444', width: 1.5, dash: 'dash' } })
        ctrlTraces.push({ x: [tA[0], tA[tA.length-1]], y: [criterion.uMin, criterion.uMin],
          type: 'scatter', mode: 'lines', name: 'u<sub>min</sub>',
          line: { color: '#f59e0b', width: 1.5, dash: 'dash' } })
      }
      imgCtrl = await renderChart(ctrlTraces, {
        xaxis: { title: { text: 'Time (s)', font: { size: 14 } }, tickfont: { size: 13 } },
        yaxis: { title: { text: 'Control signal u(t)', font: { size: 14 } }, tickfont: { size: 13 }, autorange: true },
        legend: { x: 0.99, y: 0.01, xanchor: 'right', yanchor: 'bottom' },
        margin: { l: 70, r: 40, t: 10, b: 55 },
      }, 900, 480)
    } catch {}
  }

  // Chart F — Bode (matches ResultsPage bode chart)
  let imgBode = null
  if (bd.freqs) {
    try {
      imgBode = await renderChart([
        { x: bd.freqs, y: bd.magCL, type: 'scatter', mode: 'lines', name: 'Magnitude (dB)',
          line: { color: '#3b82f6', width: 3 }, xaxis: 'x', yaxis: 'y' },
        { x: bd.freqs, y: bd.phaseCL, type: 'scatter', mode: 'lines', name: 'Phase (°)',
          line: { color: '#f59e0b', width: 3 }, xaxis: 'x', yaxis: 'y2' },
        { x: [bd.freqs[0], bd.freqs[bd.freqs.length-1]], y: [0, 0], mode: 'lines',
          line: { color: '#4b5563', width: 1.5, dash: 'dot' },
          xaxis: 'x', yaxis: 'y', showlegend: false },
      ], {
        xaxis:  { type: 'log', title: { text: 'Frequency (rad/s)', font: { size: 14 } }, tickfont: { size: 13 } },
        yaxis:  { title: { text: 'Magnitude (dB)', font: { size: 14 } }, tickfont: { size: 13 }, side: 'left' },
        yaxis2: { title: { text: 'Phase (°)', font: { size: 14 } }, tickfont: { size: 13 }, side: 'right', overlaying: 'y' },
        legend: { x: 0.99, y: 0.99, xanchor: 'right', yanchor: 'top' },
        margin: { l: 70, r: 70, t: 10, b: 55 },
      }, 1400, 580)
    } catch {}
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PAGE 1 — TITLE
  // ════════════════════════════════════════════════════════════════════════════
  fc(...C.WHITE); doc.rect(0, 0, A4_W, A4_H, 'F')
  fc(...C.BLUE);  doc.rect(0, 0, A4_W, 60, 'F')

  fs(24); fb(); tc(...C.WHITE)
  doc.text('PID Controller Tuning Report', A4_W / 2, 26, { align: 'center' })

  fs(14); fn(); tc(...C.BL_LT)
  doc.text('Generated by PID Optimal Tuner  v1.0', A4_W / 2, 38, { align: 'center' })

  fs(12); tc(...C.BL_LT)
  doc.text(dateStr, A4_W / 2, 50, { align: 'center' })

  // Decorative divider
  let y = 78
  dc(...C.BLUE); lw(0.5); doc.line(M, y, A4_W - M, y)

  y += 10
  fs(14); fb(); tc(...C.DARK)
  doc.text('Report Contents', M, y); y += 8

  const tocItems = [
    ['Page 2', 'Plant Model — Transfer function, simulation parameters, open-loop response'],
    ['Page 3', 'Optimization Setup — Criterion, constraints, gain bounds, algorithm'],
    ['Page 4', 'Optimization Convergence — Convergence chart and final result'],
    ['Page 5', 'Tuning Results: Time Domain — PID gains, step response, performance metrics'],
    ['Page 6', 'Frequency Domain Analysis — Bode plot and stability margins'],
  ]
  tocItems.forEach(([pg, desc]) => {
    fs(FS.LBL); fb(); tc(...C.BLUE)
    doc.text(pg + ':', M + 2, y)
    fn(); tc(...C.DARK)
    doc.text(desc, M + 24, y)
    y += 8
  })

  footer(1)

  // ════════════════════════════════════════════════════════════════════════════
  // PAGE 2 — PLANT MODEL
  // ════════════════════════════════════════════════════════════════════════════
  doc.addPage(); fc(...C.WHITE); doc.rect(0, 0, A4_W, A4_H, 'F')
  pageHeader('Plant Model'); y = 22

  y = secTitle('Plant Model', y)

  // Model source
  y = bodyText(`Model source: ${plant.method === 'tf' ? 'Transfer Function' : 'System Identification'}`, M, y)
  y += 3

  // Build G(s) terms
  const numTerms = [], denTerms = []
  plant.num.slice(0, 3).forEach((v, i) => {
    if (Math.abs(v) < 1e-12) return
    if (i === 0) numTerms.push(`${v}`)
    else if (i === 1) numTerms.push(`${v}·s`)
    else numTerms.push(`${v}·s²`)
  })
  plant.den.slice(0, plant.order + 1).forEach((v, i) => {
    if (Math.abs(v) < 1e-12) return
    if (i === 0) denTerms.push(`${v}`)
    else if (i === 1) denTerms.push(`${v}·s`)
    else if (i === 2) denTerms.push(`${v}·s²`)
    else if (i === 3) denTerms.push(`${v}·s³`)
    else denTerms.push(`${v}·s^${i}`)
  })
  const numStr = numTerms.length ? numTerms.join(' + ') : '0'
  const denStr = denTerms.length ? denTerms.join(' + ') : '1'
  const delayStr = plant.delay > 0 ? `  ·  e^(-${plant.delay}·s)` : ''

  fs(FS.LBL); fb(); tc(...C.DARK)
  doc.text('Transfer Function:', M, y); y += 6
  fs(FS.TAB); fn(); tc(...C.MED)
  const gLine1 = doc.splitTextToSize(`G(s)  =  ( ${numStr} )`, CW)
  doc.text(gLine1, M + 6, y); y += gLine1.length * 5.5
  dc(...C.MED); lw(0.3)
  doc.line(M + 14, y, M + 14 + Math.max(doc.getTextWidth(`  ${numStr}  `), doc.getTextWidth(`  ${denStr}  `)), y)
  y += 4
  const gLine2 = doc.splitTextToSize(`        ( ${denStr} )${delayStr}`, CW)
  doc.text(gLine2, M + 6, y); y += gLine2.length * 5.5 + 4

  // TF Coefficients — two-column layout (numerator left, denominator right)
  fs(FS.LBL); fb(); tc(...C.DARK); doc.text('Transfer Function Coefficients', M, y); y += 5

  const halfCW = (CW - 5) / 2
  const numRows = plant.num.slice(0, 3).map((v, i) => [`B${i}`, String(v)])
  const denRows = plant.den.slice(0, plant.order + 1).map((v, i) => [`A${i}`, String(v)])
  if (plant.delay > 0) denRows.push(['L (delay)', `${plant.delay} s`])

  const startY2 = y
  // Left: numerator
  const NL = halfCW / 2
  fc(...C.TH_BG); doc.rect(M, y, halfCW, RH, 'F')
  dc(...C.GRAY); lw(0.15); doc.rect(M, y, halfCW, RH, 'S')
  fs(FS.TAB); fb(); tc(...C.DARK)
  doc.text('Param', M + 2, y + RH * 0.6); doc.text('Value', M + NL + 2, y + RH * 0.6)
  let yL = y + RH
  numRows.forEach((row, ri) => {
    fc(...(ri % 2 === 0 ? C.WHITE : C.ROW_ALT)); doc.rect(M, yL, halfCW, RH, 'F')
    dc(...C.GRAY); lw(0.1); doc.rect(M, yL, halfCW, RH, 'S')
    fs(FS.TAB); fn(); tc(...C.MED)
    doc.text(row[0], M + 2, yL + RH * 0.6); doc.text(row[1], M + NL + 2, yL + RH * 0.6)
    yL += RH
  })

  // Right: denominator
  const RX = M + halfCW + 5
  fc(...C.TH_BG); doc.rect(RX, y, halfCW, RH, 'F')
  dc(...C.GRAY); lw(0.15); doc.rect(RX, y, halfCW, RH, 'S')
  fb(); tc(...C.DARK)
  doc.text('Param', RX + 2, y + RH * 0.6); doc.text('Value', RX + NL + 2, y + RH * 0.6)
  let yR = y + RH
  denRows.forEach((row, ri) => {
    fc(...(ri % 2 === 0 ? C.WHITE : C.ROW_ALT)); doc.rect(RX, yR, halfCW, RH, 'F')
    dc(...C.GRAY); lw(0.1); doc.rect(RX, yR, halfCW, RH, 'S')
    fn(); tc(...C.MED)
    doc.text(row[0], RX + 2, yR + RH * 0.6); doc.text(row[1], RX + NL + 2, yR + RH * 0.6)
    yR += RH
  })
  y = Math.max(yL, yR) + 4

  // Simulation parameters
  fs(FS.LBL); fb(); tc(...C.DARK); doc.text('Simulation Parameters', M, y); y += 5
  y = drawTable(['Parameter', 'Value'], [
    ['Integration step dt', `${dt.toFixed(6)} s`],
    ['Simulation time T',   `${T.toFixed(4)} s`],
  ], M, y, [100, 80])

  // Open-loop step response chart
  fs(FS.LBL); fb(); tc(...C.DARK); doc.text('Open-loop Step Response', M, y); y += 3
  y = addImg(imgOL, y, 58)

  // Pole-zero map chart
  fs(FS.LBL); fb(); tc(...C.DARK); doc.text('Pole-Zero Map', M, y); y += 3
  y = addImg(imgPZ, y, 48)

  // Stability indicator
  fs(FS.LBL); fb(); tc(...(olStable ? C.GREEN : C.RED))
  doc.text(olStable ? '✓ Stable open-loop system' : '⚠ Unstable open-loop system', M, y)

  footer(2)

  // ════════════════════════════════════════════════════════════════════════════
  // PAGE 3 — OPTIMIZATION SETUP
  // ════════════════════════════════════════════════════════════════════════════
  doc.addPage(); fc(...C.WHITE); doc.rect(0, 0, A4_W, A4_H, 'F')
  pageHeader('Optimization Setup'); y = 22

  y = secTitle('Optimization Setup', y)

  // Criterion formula
  const activeTerms = Object.entries(criterion.weights)
    .filter(([k]) => criterion.enabled[k] && criterion.weights[k] > 0)
    .map(([k, v]) => `${v.toFixed(2)}·${CRIT_LBL[k] || k}`)
  const crStr = activeTerms.length
    ? `Cr = ${activeTerms.join(' + ')} + Stability Penalty + Constraints Penalty`
    : 'Cr = 0 + Stability Penalty + Constraints Penalty'
  fs(FS.TAB); fb(); tc(...C.DARK)
  const crLines = doc.splitTextToSize(crStr, CW)
  doc.text(crLines, M, y); y += crLines.length * 5.5 + 5

  // Performance Metrics table
  fs(FS.LBL); fb(); tc(...C.DARK); doc.text('Performance Metrics', M, y); y += 5
  const actMetrics = Object.entries(criterion.weights)
    .filter(([k]) => criterion.enabled[k] && criterion.weights[k] > 0)
    .map(([k, v]) => [CRIT_LBL[k] || k, v.toFixed(3)])
  if (!actMetrics.length) actMetrics.push(['(none selected)', '—'])
  y = drawTable(['Criterion', 'Weight δ'], actMetrics, M, y, [110, 70])

  // Constraints table
  fs(FS.LBL); fb(); tc(...C.DARK); doc.text('Constraints', M, y); y += 5
  const ctRows = []
  if (criterion.useOvershootConstraint) ctRows.push(['Allowable Overshoot', `${criterion.overshootMax} %`])
  if (criterion.useControlConstraint) {
    ctRows.push([{ text: 'u', sub: 'min' }, String(criterion.uMin)])
    ctRows.push([{ text: 'u', sub: 'max' }, String(criterion.uMax)])
  }
  if (!ctRows.length) ctRows.push(['(no constraints enabled)', '—'])
  y = drawTable(['Parameter', 'Value'], ctRows, M, y, [110, 70])

  // PID Gain Search Bounds table
  fs(FS.LBL); fb(); tc(...C.DARK); doc.text('PID Gain Search Bounds', M, y); y += 5
  y = drawTable(
    ['Parameter', 'Lower Bound', 'Upper Bound'],
    [
      [{ text: 'k', sub: 'p' }, '0', String(optimizer.kpMax ?? 50)],
      [{ text: 'k', sub: 'i' }, '0', String(optimizer.kiMax ?? 50)],
      [{ text: 'k', sub: 'd' }, '0', String(optimizer.kdMax ?? 50)],
    ],
    M, y, [60, 60, 60]
  )

  // Optimizer Configuration
  fs(FS.LBL); fb(); tc(...C.DARK); doc.text('Optimizer Configuration', M, y); y += 5
  y = drawTable(
    ['Parameter', 'Value'],
    [
      ['Algorithm',           optimizer.selected],
      ['Agents (Population)', String(optimizer.population ?? 25)],
      ['Iterations',          String(optimizer.iterations ?? 100)],
    ],
    M, y, [110, 70]
  )

  footer(3)

  // ════════════════════════════════════════════════════════════════════════════
  // PAGE 4 — OPTIMIZATION CONVERGENCE
  // ════════════════════════════════════════════════════════════════════════════
  doc.addPage(); fc(...C.WHITE); doc.rect(0, 0, A4_W, A4_H, 'F')
  pageHeader('Optimization Convergence'); y = 22

  y = secTitle('Optimization Convergence', y)

  // Chart label with f_OF subscript
  fs(FS.LBL); fb(); tc(...C.DARK)
  doc.text('Convergence Plot — Best Objective Function ', M, y)
  const lw0 = doc.getTextWidth('Convergence Plot — Best Objective Function ')
  drawSub('f', 'OF', M + lw0, y, C.DARK)
  fs(FS.LBL); fb(); tc(...C.DARK)
  doc.text(' vs. Iteration', M + lw0 + doc.getTextWidth('f') + doc.getTextWidth('OF') * (FS.SUB / FS.LBL), y)
  y += 6
  y = addImg(imgConv, y, 88)

  // Convergence results table with f_OF subscript in cell
  fs(FS.LBL); fb(); tc(...C.DARK); doc.text('Convergence Results', M, y); y += 5
  y = drawTable(
    ['Parameter', 'Value'],
    [
      [{ text: 'Final objective function f', sub: 'OF' }, results.finalCost != null ? results.finalCost.toExponential(6) : 'N/A'],
      ['Optimization status', results.allConstraintsMet ? 'All conditions satisfied' : 'Some conditions not met'],
    ],
    M, y, [110, 70]
  )
  y += 5

  // Status text matching app style: green ✅ or red ⚠
  const statusOk = results.allConstraintsMet
  fs(FS.LBL); fb(); tc(...(statusOk ? C.GREEN : C.RED))
  const statusStr = statusOk
    ? '✅ Optimization complete and all tuning conditions satisfied!'
    : '⚠ Some conditions not met: ' + (results.statusMessage || '').replace(/^⚠️\s*/, '').replace(/^Some conditions not met:\s*/, '')
  const stLines = doc.splitTextToSize(statusStr, CW)
  doc.text(stLines, M, y)

  footer(4)

  // ════════════════════════════════════════════════════════════════════════════
  // PAGE 5 — TIME DOMAIN
  // ════════════════════════════════════════════════════════════════════════════
  doc.addPage(); fc(...C.WHITE); doc.rect(0, 0, A4_W, A4_H, 'F')
  pageHeader('Tuning Results — Time Domain'); y = 22

  y = secTitle('Tuning Results — Time Domain', y)

  // PID Gains — two tables side by side
  fs(FS.LBL); fb(); tc(...C.DARK); doc.text('Optimized PID Gains', M, y); y += 5

  const Ti = ki > 0 ? kp / ki : Infinity
  const Td = kp > 0 ? kd / kp : 0
  const hW = (CW - 5) / 2

  // Helper: draw a single-column-pair mini-table with subscript param names
  const drawGainTable = (title, rows, x) => {
    const cw = hW / 2
    fc(...C.TH_BG); doc.rect(x, y, hW, RH, 'F')
    dc(...C.GRAY); lw(0.15); doc.rect(x, y, hW, RH, 'S')
    fs(FS.TAB); fb(); tc(...C.DARK)
    doc.text(title, x + 2, y + RH * 0.6)
    let gy = y + RH
    rows.forEach(([pMain, pSub, val], ri) => {
      fc(...(ri % 2 === 0 ? C.WHITE : C.ROW_ALT)); doc.rect(x, gy, hW, RH, 'F')
      dc(...C.GRAY); lw(0.1); doc.rect(x, gy, hW, RH, 'S')
      drawSub(pMain, pSub, x + 2, gy + RH * 0.6)
      fn(); tc(...C.MED); fs(FS.TAB)
      doc.text(val, x + cw + 2, gy + RH * 0.6)
      gy += RH
    })
    return gy
  }

  const gy1 = drawGainTable('Parallel Form', [
    ['k', 'p', kp.toFixed(6)],
    ['k', 'i', ki.toFixed(6)],
    ['k', 'd', kd.toFixed(6)],
  ], M)

  const gy2 = drawGainTable('Standard Form', [
    ['K', 'p', kp.toFixed(6)],
    ['T', 'i', isFinite(Ti) ? Ti.toFixed(6) + ' s' : '∞'],
    ['T', 'd', Td.toFixed(6) + ' s'],
  ], M + hW + 5)

  y = Math.max(gy1, gy2) + 5

  // Charts side by side
  const cH = (CW - 4) / 2
  const CH = 62
  fs(FS.TAB); fb(); tc(...C.DARK)
  doc.text('Step Response y(t)', M, y)
  doc.text('Control Signal u(t)', M + cH + 4, y)
  y += 3
  if (imgStep) doc.addImage(imgStep, 'PNG', M, y, cH, CH)
  if (imgCtrl) doc.addImage(imgCtrl, 'PNG', M + cH + 4, y, cH, CH)
  y += CH + 5

  // Performance Metrics table
  fs(FS.LBL); fb(); tc(...C.DARK); doc.text('Performance Metrics', M, y); y += 5
  y = drawTable(
    ['Metric', 'Value'],
    [
      ['ITAE',               (met.ITAE         ?? 0).toFixed(6)],
      ['IAE',                (met.IAE          ?? 0).toFixed(6)],
      ['ISE',                (met.ISE          ?? 0).toFixed(6)],
      ['ITSE',               (met.ITSE         ?? 0).toFixed(6)],
      ['Overshoot',          `${(met.overshoot ?? 0).toFixed(2)} %`],
      ['Rise Time',          `${(met.riseTime  ?? 0).toFixed(4)} s`],
      ['Settling Time',      `${(met.settlingTime ?? 0).toFixed(4)} s`],
      ['Steady-state Error', (met.ess          ?? 0).toFixed(6)],
    ],
    M, y, [110, 70]
  )

  footer(5)

  // ════════════════════════════════════════════════════════════════════════════
  // PAGE 6 — FREQUENCY DOMAIN
  // ════════════════════════════════════════════════════════════════════════════
  doc.addPage(); fc(...C.WHITE); doc.rect(0, 0, A4_W, A4_H, 'F')
  pageHeader('Frequency Domain Analysis'); y = 22

  y = secTitle('Frequency Domain Analysis', y)

  // Bode chart
  fs(FS.LBL); fb(); tc(...C.DARK)
  doc.text('Closed-loop Bode Plot  H(jω) = C(jω)·G(jω) / (1 + C(jω)·G(jω))', M, y); y += 3
  y = addImg(imgBode, y, 90)

  // Stability Margins table
  fs(FS.LBL); fb(); tc(...C.DARK); doc.text('Stability Margins', M, y); y += 5

  const gm = bd.gainMargin
  const pm = bd.phaseMargin
  const gmOk = !isFinite(gm) || gm > 6
  const pmGood = !isFinite(pm) || pm > 45
  const pmAccept = !isFinite(pm) || pm >= 30

  y = drawTable(
    ['Parameter', 'Value', 'Status'],
    [
      ['Gain Margin',
       isFinite(gm) ? `${gm.toFixed(2)} dB` : '∞',
       { value: gmOk ? '✓' : '⚠', color: gmOk ? C.GREEN : C.WARN, bold: true }],
      ['Phase Margin',
       isFinite(pm) ? `${pm.toFixed(2)} °` : '∞',
       { value: pmGood ? '✓' : pmAccept ? '⚠' : '✗',
         color: pmGood ? C.GREEN : pmAccept ? C.WARN : C.RED, bold: true }],
      ['Crossover Freq',
       bd.phaseMarginFreq ? `${bd.phaseMarginFreq.toFixed(3)} rad/s` : 'N/A',
       { value: '—', color: C.MED }],
      ['Phase Crossover',
       bd.gainMarginFreq ? `${bd.gainMarginFreq.toFixed(3)} rad/s` : 'N/A',
       { value: '—', color: C.MED }],
    ],
    M, y, [80, 60, 40]
  )
  y += 4

  // Phase margin comment
  let pmColor, pmTxt
  if (pmGood)   { pmColor = C.GREEN; pmTxt = '✓ Good — adequate stability margin' }
  else if (pmAccept) { pmColor = C.WARN; pmTxt = '⚠ Acceptable — consider re-tuning for better stability' }
  else          { pmColor = C.RED;  pmTxt = '✗ Poor — system may be poorly damped, re-tuning recommended' }

  fs(FS.LBL); fb(); tc(...pmColor)
  const pmLines = doc.splitTextToSize('Phase Margin: ' + pmTxt, CW)
  doc.text(pmLines, M, y)

  footer(6)

  // ── Save ──────────────────────────────────────────────────────────────────
  doc.save(`PID_Tuning_Report_${fileDateStr}.pdf`)
}
