import Plotly from 'plotly.js-dist-min'
import { simulate, computeSimParams } from '../math/simulation'
import { polynomialRoots } from '../store/useStore'

// ── Colors ───────────────────────────────────────────────────────────────────
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
  // App UI colors
  APP_BG:     [221, 227, 237],   // dark-bg  #dde3ed
  APP_BORDER: [184, 196, 216],   // dark-border #b8c4d8
  APP_TEXT:   [55,  65,  81],    // gray-700 #374151
}

const A4_W = 210, A4_H = 297, M = 15, CW = A4_W - 2 * M
const TOTAL = 6
const RH = 10     // table row height mm
const FS = { SEC: 20, LBL: 13, TAB: 12, SUB: 7.8 }
const SUB_DY = FS.TAB * 0.35 * 0.353   // subscript y-offset: pt → mm

const pad2 = n => String(n).padStart(2, '0')

// ── Plotly base layout that matches the app (PlotlyChart.jsx DARK_LAYOUT) ───
const APP = {
  paper_bgcolor: '#edf0f6',
  plot_bgcolor:  '#edf0f6',
  font:   { color: '#374151', family: 'Inter, system-ui, sans-serif' },
  xaxis:  { gridcolor: '#b8c4d8', linecolor: '#9ca3af', tickcolor: '#6b7280',
            zerolinecolor: '#b8c4d8', showline: true, mirror: true, linewidth: 1.5 },
  yaxis:  { gridcolor: '#b8c4d8', linecolor: '#9ca3af', tickcolor: '#6b7280',
            zerolinecolor: '#b8c4d8', showline: true, mirror: true, linewidth: 1.5 },
  legend: { bgcolor: 'rgba(237,240,246,0.9)', bordercolor: '#b8c4d8', borderwidth: 1 },
}

// Chart font multiplier: 1.0 = normal (page 2), 1.5 = enlarged (pages 4-6)
function makeChartLayout(base, fontScale = 1.0) {
  const s = fontScale
  return {
    xaxis:  { ...base.xaxis,  title: { ...base.xaxis?.title,  font: { size: (base.xaxis?.title?.font?.size || 14) * s } }, tickfont: { size: Math.round(13 * s) } },
    yaxis:  { ...base.yaxis,  title: { ...base.yaxis?.title,  font: { size: (base.yaxis?.title?.font?.size || 14) * s } }, tickfont: { size: Math.round(13 * s) } },
    ...(base.yaxis2 ? { yaxis2: { ...base.yaxis2, title: { ...base.yaxis2?.title, font: { size: (base.yaxis2?.title?.font?.size || 14) * s } }, tickfont: { size: Math.round(13 * s) } } } : {}),
    legend: { ...base.legend, font: { size: Math.round(15 * s) } },
    ...(base.title ? { title: { ...base.title, font: { size: Math.round((base.title?.font?.size || 16) * s) } } } : {}),
  }
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

  // ── jsPDF micro-helpers ───────────────────────────────────────────────────
  const fc = (...c) => doc.setFillColor(...c)
  const tc = (...c) => doc.setTextColor(...c)
  const dc = (...c) => doc.setDrawColor(...c)
  const lw = v => doc.setLineWidth(v)
  const fs = v => doc.setFontSize(v)
  const fb = () => doc.setFont('helvetica', 'bold')
  const fn = () => doc.setFont('helvetica', 'normal')

  const secTitle = (txt, y) => {
    fs(FS.SEC); fb(); tc(...C.BLUE)
    doc.text(txt, M, y)
    dc(...C.BL_LT); lw(0.4)
    doc.line(M, y + 1.5, A4_W - M, y + 1.5)
    return y + 10
  }

  // Draw text with subscript next to it; returns approximate right edge
  const drawSub = (main, sub, x, y, color = C.MED) => {
    fs(FS.TAB); fn(); tc(...color)
    doc.text(main, x, y)
    const mw = doc.getTextWidth(main)
    fs(FS.SUB); doc.text(sub, x + mw, y + SUB_DY)
    const sw = doc.getTextWidth(sub)
    fs(FS.TAB)
    return x + mw + sw
  }

  // Bold subscript (for headings)
  const drawSubBold = (main, sub, x, y, size, color = C.DARK) => {
    fs(size); fb(); tc(...color)
    doc.text(main, x, y)
    const mw = doc.getTextWidth(main)
    const subSize = size * 0.65
    fs(subSize); doc.text(sub, x + mw, y + size * 0.35 * 0.353)
    const sw = doc.getTextWidth(sub)
    fs(size)
    return x + mw + sw
  }

  // Table — cell may be: string | {value,color,bold} | {text,sub,color}
  const drawTable = (headers, rows, x, y, colW) => {
    const TW = colW.reduce((a, b) => a + b, 0)
    const drawRow = (cells, isHeader, ri) => {
      fc(...(isHeader ? C.TH_BG : ri % 2 === 0 ? C.WHITE : C.ROW_ALT))
      doc.rect(x, y, TW, RH, 'F')
      dc(...C.GRAY); lw(0.15); doc.rect(x, y, TW, RH, 'S')
      let cx = x
      cells.forEach((cell, ci) => {
        const isObj = cell && typeof cell === 'object'
        if (isHeader) {
          fs(FS.TAB); fb(); tc(...C.DARK)
          doc.text(String(isObj ? (cell.value ?? cell.text ?? '') : cell), cx + 2, y + RH * 0.62)
        } else if (isObj && 'text' in cell && 'sub' in cell) {
          drawSub(cell.text, cell.sub, cx + 2, y + RH * 0.62, cell.color || C.MED)
        } else if (isObj && 'value' in cell) {
          fs(FS.TAB); isObj && cell.bold ? fb() : fn(); tc(...(cell.color || C.MED))
          doc.text(String(cell.value), cx + 2, y + RH * 0.62); fn()
        } else {
          fs(FS.TAB); fn(); tc(...C.MED)
          doc.text(String(cell ?? ''), cx + 2, y + RH * 0.62)
        }
        cx += colW[ci]
      })
    }
    drawRow(headers, true, -1); y += RH
    rows.forEach((row, ri) => { drawRow(row, false, ri); y += RH })
    return y + 3
  }

  // Add Plotly chart image
  const addImg = (img, y, h) => {
    if (img) { doc.addImage(img, 'PNG', M, y, CW, h); return y + h }
    return y
  }

  // Footer — bigger + bold
  const footer = p => {
    fs(16); fb(); tc(...C.GRAY)
    doc.text(`Page ${p} of ${TOTAL}`, A4_W / 2, A4_H - 8, { align: 'center' })
  }

  // Draw an app-styled box (like G(s) or Cr formula display in the app)
  const drawAppBox = (lines, y) => {
    const PAD = 5, LH = 6.5
    const boxH = lines.length * LH + 2 * PAD
    fc(...C.APP_BG); doc.rect(M, y, CW, boxH, 'F')
    dc(...C.APP_BORDER); lw(0.5); doc.rect(M, y, CW, boxH, 'S')
    fs(FS.TAB); fn(); tc(...C.APP_TEXT)
    lines.forEach((line, i) => {
      const lw2 = doc.getTextWidth(line)
      doc.text(line, M + (CW - lw2) / 2, y + PAD + (i + 0.85) * LH)
    })
    return y + boxH + 5
  }

  // ── Data shortcuts ─────────────────────────────────────────────────────────
  const kp = results.kp ?? 0, ki = results.ki ?? 0, kd = results.kd ?? 0
  const met   = results.metrics  || {}
  const bd    = results.freqData || {}
  const conv  = results.convergence || []
  const CRIT_LBL = { w1:'ITAE', w2:'IAE', w3:'ISE', w4:'ITSE', w5:'Overshoot', w6:'Rise Time', w7:'Settling Time', w8:'Steady-state Error' }

  const now = new Date()
  const dateStr = `${pad2(now.getDate())}/${pad2(now.getMonth()+1)}/${now.getFullYear()}  ${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`
  const fileDate = `${now.getFullYear()}-${pad2(now.getMonth()+1)}-${pad2(now.getDate())}`
  const { dt, T } = computeSimParams(plant.den, plant.delay)

  // ── Chart G(s) string (matches ModelPage display) ─────────────────────────
  const fmtNum = (v, i) => {
    if (Math.abs(v) < 1e-12) return null
    if (i === 0) return String(v)
    if (i === 1) return `${v}·s`
    if (i === 2) return `${v}·s²`
    return `${v}·s^${i}`
  }
  const numTerms = plant.num.slice(0, 3).map(fmtNum).filter(Boolean)
  const denTerms = plant.den.slice(0, plant.order + 1).map(fmtNum).filter(Boolean)
  const gsText = `G(s) = [${numTerms.join(' + ') || '0'}] / [${denTerms.join(' + ') || '1'}]${plant.delay > 0 ? ` · e^(-${plant.delay}s)` : ''}`

  // ── Cr formula string (matches CriterionPage display) ─────────────────────
  const activeTerms = Object.entries(criterion.weights)
    .filter(([k]) => criterion.enabled[k] && criterion.weights[k] > 0)
    .map(([k, v]) => `${v.toFixed(2)}·${CRIT_LBL[k] || k}`)
  const crText = activeTerms.length
    ? `Cr = ${activeTerms.join(' + ')} + Stability Penalty + Constraints Penalty`
    : 'Cr = 0 + Stability Penalty + Constraints Penalty'

  // ── Pre-render all charts ──────────────────────────────────────────────────

  // Page 2 — open-loop step response (app font scale 1.0)
  let imgOL = null
  try {
    const ol = simulate(plant.num, plant.den, plant.delay, 0, 0, 0, { dt, T, r: 1, openLoop: true })
    const tA = Array.from(ol.t)
    const olBase = {
      title: { text: '<b>Open-loop Step Response</b>', font: { size: 16 } },
      xaxis: { title: { text: 'Time (s)', font: { size: 14 } } },
      yaxis: { title: { text: 'Output y(t) / Setpoint r(t)', font: { size: 14 } }, autorange: true },
      legend: { x: 0.99, y: 0.01, xanchor: 'right', yanchor: 'bottom', font: { size: 15 } },
      margin: { l: 70, r: 40, t: 50, b: 55 },
    }
    imgOL = await renderChart([
      { x: tA, y: Array.from(ol.y), type: 'scatter', mode: 'lines',
        name: '<b>y(t) — step response</b>', line: { color: '#3b82f6', width: 3 } },
      { x: tA, y: tA.map(() => 1), type: 'scatter', mode: 'lines',
        name: '<b>r(t) — setpoint</b>', line: { color: '#ef4444', width: 3 } },
    ], olBase)
  } catch {}

  // Page 2 — pole-zero map (app font scale 1.0)
  let imgPZ = null, olStable = true
  try {
    const activeDen = plant.den.slice(0, plant.order + 1)
    const n = activeDen.length - 1
    if (n > 0) {
      const an = activeDen[n]
      const poly = Array.from({ length: n + 1 }, (_, i) => activeDen[n - i] / an)
      const poles = polynomialRoots(poly)
      olStable = poles.length > 0 && poles.every(p => p.re < -1e-9)
      const b0 = plant.num[0] ?? 0, b1 = plant.num[1] ?? 0
      const pzeros = Math.abs(b1) > 1e-12 ? [{ re: -b0 / b1, im: 0 }] : []
      const pzBase = {
        title: { text: '<b>Pole-Zero Map</b>', font: { size: 16 } },
        xaxis: { title: { text: 'Real (Re)', font: { size: 14 } }, zeroline: false },
        yaxis: { title: { text: 'Imaginary (Im)', font: { size: 14 } }, zeroline: false },
        shapes: [
          { type: 'line', x0: 0, x1: 0, y0: 0, y1: 1, xref: 'x', yref: 'paper', line: { color: '#9ca3af', dash: 'dash', width: 1.5 } },
          { type: 'line', x0: 0, x1: 1, y0: 0, y1: 0, xref: 'paper', yref: 'y', line: { color: '#9ca3af', dash: 'dash', width: 1.5 } },
        ],
        legend: { x: 0.99, y: 0.01, xanchor: 'right', yanchor: 'bottom', font: { size: 15 } },
        margin: { l: 70, r: 40, t: 50, b: 55 },
      }
      imgPZ = await renderChart([
        { x: pzeros.map(z => z.re), y: pzeros.map(z => z.im), type: 'scatter', mode: 'markers',
          name: '<b>Zeros</b>', marker: { symbol: 'circle-open', size: 14, color: '#3b82f6', line: { width: 2.5 } } },
        { x: poles.map(p => p.re),  y: poles.map(p => p.im),  type: 'scatter', mode: 'markers',
          name: '<b>Poles</b>', marker: { symbol: 'x', size: 14, color: '#ef4444', line: { width: 2.5 } } },
      ], pzBase, 1400, 480)
    }
  } catch {}

  // Page 4 — convergence (1.5× font scale)
  let imgConv = null
  if (conv.length > 0) {
    try {
      const convBase = {
        xaxis: { title: { text: 'Iteration', font: { size: 14 } } },
        yaxis: { title: { text: 'f<sub>OF</sub> (logarithmic scale)', font: { size: 14 } }, type: 'log', autorange: true },
        legend: { x: 0.99, y: 0.99, xanchor: 'right', yanchor: 'top', font: { size: 15 } },
        margin: { l: 70, r: 40, t: 20, b: 55 },
      }
      const convScaled = makeChartLayout(convBase, 1.5)
      imgConv = await renderChart([
        { x: conv.map((_, i) => i + 1), y: conv, type: 'scatter', mode: 'markers',
          name: 'f<sub>OF</sub>', marker: { color: '#000000', size: 13 } },
      ], { ...convBase, ...convScaled })
    } catch {}
  }

  // Pages 5 — step response & control signal (1.5× font, 1.5× line width)
  let imgStep = null, imgCtrl = null
  if (results.simData) {
    const sd = results.simData
    const tA = Array.from(sd.t), yA = Array.from(sd.y), uA = Array.from(sd.u)
    const stepBase = {
      xaxis: { title: { text: 'Time (s)', font: { size: 14 } } },
      yaxis: { title: { text: 'Output y(t)', font: { size: 14 } }, autorange: true },
      legend: { x: 0.99, y: 0.01, xanchor: 'right', yanchor: 'bottom', font: { size: 15 } },
      margin: { l: 70, r: 40, t: 10, b: 55 },
    }
    const stepScaled = makeChartLayout(stepBase, 1.5)
    try {
      imgStep = await renderChart([
        { x: tA, y: yA, type: 'scatter', mode: 'lines', name: 'y(t)',
          line: { color: '#3b82f6', width: 4.5 } },
        { x: [tA[0], tA[tA.length-1]], y: [1, 1], type: 'scatter', mode: 'lines',
          name: 'Setpoint r(t)', line: { color: '#ef4444', width: 2.25 } },
      ], { ...stepBase, ...stepScaled }, 900, 480)
    } catch {}
    const ctrlBase = {
      xaxis: { title: { text: 'Time (s)', font: { size: 14 } } },
      yaxis: { title: { text: 'Control signal u(t)', font: { size: 14 } }, autorange: true },
      legend: { x: 0.99, y: 0.01, xanchor: 'right', yanchor: 'bottom', font: { size: 15 } },
      margin: { l: 70, r: 40, t: 10, b: 55 },
    }
    const ctrlScaled = makeChartLayout(ctrlBase, 1.5)
    try {
      const ctrlTraces = [
        { x: tA, y: uA, type: 'scatter', mode: 'lines', name: 'u(t)', line: { color: '#8b5cf6', width: 4.5 } },
      ]
      if (criterion.useControlConstraint) {
        ctrlTraces.push({ x: [tA[0], tA[tA.length-1]], y: [criterion.uMax, criterion.uMax],
          type: 'scatter', mode: 'lines', name: 'u<sub>max</sub>', line: { color: '#ef4444', width: 2.25, dash: 'dash' } })
        ctrlTraces.push({ x: [tA[0], tA[tA.length-1]], y: [criterion.uMin, criterion.uMin],
          type: 'scatter', mode: 'lines', name: 'u<sub>min</sub>', line: { color: '#f59e0b', width: 2.25, dash: 'dash' } })
      }
      imgCtrl = await renderChart(ctrlTraces, { ...ctrlBase, ...ctrlScaled }, 900, 480)
    } catch {}
  }

  // Page 6 — Bode (1.5× font, 1.5× line width)
  let imgBode = null
  if (bd.freqs) {
    try {
      const bodeBase = {
        xaxis:  { title: { text: 'Frequency (rad/s)', font: { size: 14 } }, type: 'log' },
        yaxis:  { title: { text: 'Magnitude (dB)', font: { size: 14 } }, side: 'left' },
        yaxis2: { title: { text: 'Phase (°)',       font: { size: 14 } }, side: 'right', overlaying: 'y' },
        legend: { x: 0.99, y: 0.99, xanchor: 'right', yanchor: 'top', font: { size: 15 } },
        margin: { l: 70, r: 70, t: 10, b: 55 },
      }
      const bodeScaled = makeChartLayout(bodeBase, 1.5)
      imgBode = await renderChart([
        { x: bd.freqs, y: bd.magCL,   type: 'scatter', mode: 'lines', name: 'Magnitude (dB)',
          line: { color: '#3b82f6', width: 4.5 }, xaxis: 'x', yaxis: 'y' },
        { x: bd.freqs, y: bd.phaseCL, type: 'scatter', mode: 'lines', name: 'Phase (°)',
          line: { color: '#f59e0b', width: 4.5 }, xaxis: 'x', yaxis: 'y2' },
        { x: [bd.freqs[0], bd.freqs[bd.freqs.length-1]], y: [0, 0], mode: 'lines',
          line: { color: '#4b5563', width: 2.25, dash: 'dot' }, xaxis: 'x', yaxis: 'y', showlegend: false },
      ], { ...bodeBase, ...bodeScaled }, 1400, 580)
    } catch {}
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PAGE 1 — TITLE
  // ════════════════════════════════════════════════════════════════════════════
  let y
  fc(...C.WHITE); doc.rect(0, 0, A4_W, A4_H, 'F')
  fc(...C.BLUE);  doc.rect(0, 0, A4_W, 60, 'F')

  fs(24); fb(); tc(...C.WHITE)
  doc.text('PID Controller Tuning Report', A4_W / 2, 26, { align: 'center' })
  fs(14); fn(); tc(...C.BL_LT)
  doc.text('Generated by PID Optimal Tuner  v1.2', A4_W / 2, 38, { align: 'center' })
  fs(12); tc(...C.BL_LT)
  doc.text(dateStr, A4_W / 2, 50, { align: 'center' })

  y = 75
  dc(...C.BLUE); lw(0.5); doc.line(M, y, A4_W - M, y); y += 10

  fs(14); fb(); tc(...C.DARK); doc.text('Report Contents', M, y); y += 8
  ;[
    ['Page 2', 'Plant Model - Transfer function, simulation parameters, open-loop charts'],
    ['Page 3', 'Optimization Setup - Objective function, constraints, optimizer config'],
    ['Page 4', 'Optimization Convergence - Convergence chart and final result'],
    ['Page 5', 'Tuning Results: Time Domain - PID gains, step response, metrics'],
    ['Page 6', 'Frequency Domain Analysis - Bode plot and stability margins'],
  ].forEach(([pg, desc]) => {
    fs(FS.LBL); fb(); tc(...C.BLUE); doc.text(pg + ':', M + 2, y)
    fn(); tc(...C.DARK); doc.text(desc, M + 24, y); y += 8
  })

  footer(1)

  // ════════════════════════════════════════════════════════════════════════════
  // PAGE 2 — PLANT MODEL  (no header bar)
  // ════════════════════════════════════════════════════════════════════════════
  doc.addPage(); fc(...C.WHITE); doc.rect(0, 0, A4_W, A4_H, 'F')
  y = M
  y = secTitle('Plant Model', y)

  fs(FS.LBL); fn(); tc(...C.DARK)
  const msrc = plant.method === 'tf' ? 'Transfer Function' : 'System Identification'
  doc.text(`Model source: ${msrc}`, M, y); y += 7

  // G(s) box — styled like the app
  const gsLines = doc.splitTextToSize(gsText, CW - 10)
  // Ensure the font is set before calling getTextWidth
  fs(FS.TAB); fn()
  y = drawAppBox(gsLines, y)

  // TF Coefficients — single unified table with subscripts
  y += 3
  fs(FS.LBL); fb(); tc(...C.DARK); doc.text('Transfer Function Coefficients', M, y); y += 5

  const tfRows = []
  let maxBidx = 0
  plant.num.forEach((v, i) => { if (Math.abs(v) > 1e-12 && i < 3) maxBidx = i })
  plant.num.slice(0, maxBidx + 1).forEach((v, i) => {
    tfRows.push([{ text: 'B', sub: String(i) }, String(v)])
  })
  plant.den.slice(0, plant.order + 1).forEach((v, i) =>
    tfRows.push([{ text: 'A', sub: String(i) }, String(v)])
  )
  if (plant.delay > 0) tfRows.push([{ text: 'L', sub: '' }, `${plant.delay} s`])
  y = drawTable(['Parameter', 'Value'], tfRows, M, y, [80, 100])

  // Simulation Parameters
  y += 5
  fs(FS.LBL); fb(); tc(...C.DARK); doc.text('Simulation Parameters', M, y); y += 5
  y = drawTable(['Parameter', 'Value'], [
    ['Integration step dt', `${dt.toFixed(6)} s`],
    ['Simulation time T',   `${T.toFixed(4)} s`],
  ], M, y, [100, 80])

  // Open-loop Step Response
  y += 6
  fs(FS.LBL); fb(); tc(...C.DARK); doc.text('Open-loop Step Response', M, y); y += 4
  y = addImg(imgOL, y, 50); y += 4

  // Pole-Zero Map
  fs(FS.LBL); fb(); tc(...C.DARK); doc.text('Pole-Zero Map', M, y); y += 4
  y = addImg(imgPZ, y, 42)

  // Stability text — placed immediately below PZ chart
  fs(FS.LBL); fb(); tc(...(olStable ? C.GREEN : C.RED))
  doc.text(olStable ? 'Stable open-loop system' : 'Unstable open-loop system', M, y + 3)

  footer(2)

  // ════════════════════════════════════════════════════════════════════════════
  // PAGE 3 — OPTIMIZATION SETUP  (no header bar)
  // ════════════════════════════════════════════════════════════════════════════
  doc.addPage(); fc(...C.WHITE); doc.rect(0, 0, A4_W, A4_H, 'F')
  y = M
  y = secTitle('Optimization Setup', y)

  // "Objective function to minimize" + Cr formula box
  fs(FS.LBL); fb(); tc(...C.DARK); doc.text('Objective function to minimize:', M, y); y += 6
  fs(FS.TAB); fn()
  const crLines = doc.splitTextToSize(crText, CW - 10)
  y = drawAppBox(crLines, y)

  // Constraints
  y += 6
  fs(FS.LBL); fb(); tc(...C.DARK); doc.text('Constraints', M, y); y += 5
  const ctRows = []
  if (criterion.useOvershootConstraint) ctRows.push(['Allowable Overshoot', `${criterion.overshootMax} %`])
  if (criterion.useControlConstraint) {
    ctRows.push([{ text: 'u', sub: 'min' }, String(criterion.uMin)])
    ctRows.push([{ text: 'u', sub: 'max' }, String(criterion.uMax)])
  }
  if (!ctRows.length) ctRows.push(['(no constraints enabled)', '—'])
  y = drawTable(['Parameter', 'Value'], ctRows, M, y, [110, 70])

  // PID Gain Search Bounds
  y += 6
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

  // Optimizer Configuration (Value → Value/Feature)
  y += 6
  fs(FS.LBL); fb(); tc(...C.DARK); doc.text('Optimizer Configuration', M, y); y += 5
  y = drawTable(
    ['Parameter', 'Value/Feature'],
    [
      ['Algorithm',           optimizer.selected],
      ['Agents (Population)', String(optimizer.population ?? 25)],
      ['Iterations',          String(optimizer.iterations ?? 100)],
    ],
    M, y, [100, 80]
  )

  footer(3)

  // ════════════════════════════════════════════════════════════════════════════
  // PAGE 4 — OPTIMIZATION CONVERGENCE  (no header bar)
  // ════════════════════════════════════════════════════════════════════════════
  doc.addPage(); fc(...C.WHITE); doc.rect(0, 0, A4_W, A4_H, 'F')
  y = M
  y = secTitle('Optimization Convergence', y)

  // "Convergence Plot - Best Objective Function f_OF vs. Iteration" - bold, with subscript
  fs(FS.LBL); fb(); tc(...C.DARK)
  const cpTxt1 = 'Convergence Plot - Best Objective Function '
  doc.text(cpTxt1, M, y)
  const cpW1 = doc.getTextWidth(cpTxt1)
  const cpX2 = drawSubBold('f', 'OF', M + cpW1, y, FS.LBL, C.DARK)
  const cpTxt3 = ' vs. Iteration'
  fs(FS.LBL); fb(); tc(...C.DARK); doc.text(cpTxt3, cpX2, y)
  y += 5

  y = addImg(imgConv, y, 90); y += 6

  // Convergence Results (Value → Value/Feature)
  fs(FS.LBL); fb(); tc(...C.DARK); doc.text('Convergence Results', M, y); y += 5
  y = drawTable(
    ['Parameter', 'Value/Feature'],
    [
      [{ text: 'Final f', sub: 'OF' }, results.finalCost != null ? results.finalCost.toExponential(6) : 'N/A'],
      ['Optimization status', results.allConstraintsMet ? 'All conditions satisfied' : 'Some conditions not met'],
    ],
    M, y, [110, 70]
  )
  y += 6

  // Status — fully visible, word-wrapped
  const statusOk = results.allConstraintsMet
  fs(FS.LBL); fb(); tc(...(statusOk ? C.GREEN : C.RED))
  const rawStatus = (results.statusMessage || '')
    .replace(/[✅⚠️]/g, '').replace(/^\s*Some conditions not met:\s*/i, '').trim()
  const fullStatus = statusOk
    ? 'Optimization complete and all tuning conditions satisfied!'
    : `Some conditions not met: ${rawStatus}`
  const stLines = doc.splitTextToSize(fullStatus, CW)
  stLines.forEach((line, i) => { doc.text(line, M, y + i * 7) })

  footer(4)

  // ════════════════════════════════════════════════════════════════════════════
  // PAGE 5 — TIME DOMAIN  (no header bar)
  // ════════════════════════════════════════════════════════════════════════════
  doc.addPage(); fc(...C.WHITE); doc.rect(0, 0, A4_W, A4_H, 'F')
  y = M
  y = secTitle('Tuning Results - Time Domain', y)

  // PID Gains — two tables side by side
  fs(FS.LBL); fb(); tc(...C.DARK); doc.text('Optimized PID Gains', M, y); y += 5

  const Ti = ki > 0 ? kp / ki : Infinity
  const Td = kp > 0 ? kd / kp : 0
  const hW = (CW - 5) / 2

  const drawGainTable = (title, rows, x) => {
    const cw1 = hW * 0.4
    fc(...C.TH_BG); doc.rect(x, y, hW, RH, 'F')
    dc(...C.GRAY); lw(0.15); doc.rect(x, y, hW, RH, 'S')
    fs(FS.TAB); fb(); tc(...C.DARK); doc.text(title, x + 2, y + RH * 0.62)
    let gy = y + RH
    rows.forEach(([pm, ps, val], ri) => {
      fc(...(ri % 2 === 0 ? C.WHITE : C.ROW_ALT)); doc.rect(x, gy, hW, RH, 'F')
      dc(...C.GRAY); lw(0.1); doc.rect(x, gy, hW, RH, 'S')
      drawSub(pm, ps, x + 2, gy + RH * 0.62)
      fn(); tc(...C.MED); fs(FS.TAB)
      doc.text(val, x + cw1 + 2, gy + RH * 0.62)
      gy += RH
    })
    return gy
  }

  const gy1 = drawGainTable('Parallel Form', [['k','p',kp.toFixed(6)],['k','i',ki.toFixed(6)],['k','d',kd.toFixed(6)]], M)
  const gy2 = drawGainTable('Standard Form', [['K','p',kp.toFixed(6)],['T','i',isFinite(Ti)?Ti.toFixed(6)+' s':'Inf'],['T','d',Td.toFixed(6)+' s']], M + hW + 5)
  y = Math.max(gy1, gy2) + 6

  // Step Response y(t)
  fs(FS.LBL); fb(); tc(...C.DARK); doc.text('Step Response y(t)', M, y); y += 4
  y = addImg(imgStep, y, 54); y += 5

  // Control Signal u(t)
  fs(FS.LBL); fb(); tc(...C.DARK); doc.text('Control Signal u(t)', M, y); y += 4
  y = addImg(imgCtrl, y, 54); y += 5

  // Performance Metrics — 2-column layout to save vertical space
  fs(FS.LBL); fb(); tc(...C.DARK); doc.text('Performance Metrics', M, y); y += 5
  y = drawTable(
    ['Metric', 'Value', 'Metric', 'Value'],
    [
      ['ITAE',  (met.ITAE  ?? 0).toFixed(4), 'Overshoot',          `${(met.overshoot    ?? 0).toFixed(2)} %`],
      ['IAE',   (met.IAE   ?? 0).toFixed(4), 'Rise Time',          `${(met.riseTime     ?? 0).toFixed(4)} s`],
      ['ISE',   (met.ISE   ?? 0).toFixed(4), 'Settling Time',      `${(met.settlingTime ?? 0).toFixed(4)} s`],
      ['ITSE',  (met.ITSE  ?? 0).toFixed(4), 'Steady-state Error', (met.ess             ?? 0).toFixed(6)],
    ],
    M, y, [45, 45, 45, 45]
  )

  footer(5)

  // ════════════════════════════════════════════════════════════════════════════
  // PAGE 6 — FREQUENCY DOMAIN  (no header bar)
  // ════════════════════════════════════════════════════════════════════════════
  doc.addPage(); fc(...C.WHITE); doc.rect(0, 0, A4_W, A4_H, 'F')
  y = M
  y = secTitle('Frequency Domain Analysis', y)

  // Bode plot — no formula text label
  y = addImg(imgBode, y, 92); y += 6

  // Stability Margins — 2 columns only (no Status column)
  const gm = bd.gainMargin, pm = bd.phaseMargin
  fs(FS.LBL); fb(); tc(...C.DARK); doc.text('Stability Margins', M, y); y += 5
  y = drawTable(
    ['Parameter', 'Value'],
    [
      ['Gain Margin',    isFinite(gm) ? `${gm.toFixed(2)} dB` : 'Inf'],
      ['Phase Margin',   isFinite(pm) ? `${pm.toFixed(2)} deg` : 'Inf'],
      ['Crossover Freq', bd.phaseMarginFreq ? `${bd.phaseMarginFreq.toFixed(3)} rad/s` : 'N/A'],
      ['Phase Crossover', bd.gainMarginFreq  ? `${bd.gainMarginFreq.toFixed(3)} rad/s`  : 'N/A'],
    ],
    M, y, [100, 80]
  )
  y += 6

  // Phase margin comment — fully visible, word-wrapped
  const pmGood = !isFinite(pm) || pm > 45
  const pmAccept = !isFinite(pm) || pm >= 30
  let pmColor, pmTxt
  if (pmGood)        { pmColor = C.GREEN; pmTxt = 'Good - adequate stability margin' }
  else if (pmAccept) { pmColor = C.WARN;  pmTxt = 'Acceptable - consider re-tuning for better stability' }
  else               { pmColor = C.RED;   pmTxt = 'Poor - system may be poorly damped, re-tuning recommended' }

  fs(FS.LBL); fb(); tc(...pmColor)
  const pmStr = `Phase Margin: ${pmTxt}`
  const pmLines = doc.splitTextToSize(pmStr, CW)
  pmLines.forEach((line, i) => { doc.text(line, M, y + i * 7) })

  footer(6)

  // ── Save ──────────────────────────────────────────────────────────────────
  doc.save(`PID_Tuning_Report_${fileDate}.pdf`)
}
