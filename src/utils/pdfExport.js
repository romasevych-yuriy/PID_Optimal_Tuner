import Plotly from 'plotly.js-dist-min'

export async function generatePDF({ plant, criterion, optimizer, results }) {
  const { jsPDF } = await import('jspdf')

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = 210, H = 297
  const margin = 18
  const textW = W - margin * 2

  // Colors
  const DARK = [15, 17, 23]
  const CARD = [26, 31, 46]
  const ACCENT = [59, 130, 246]
  const GREEN = [16, 185, 129]
  const GRAY = [156, 163, 175]
  const TEXT = [229, 231, 235]

  const bg = (x, y, w, h, color) => {
    doc.setFillColor(...color)
    doc.rect(x, y, w, h, 'F')
  }

  const heading = (text, y, size = 14) => {
    doc.setFontSize(size)
    doc.setTextColor(...ACCENT)
    doc.text(text, margin, y)
    doc.setDrawColor(...ACCENT)
    doc.setLineWidth(0.3)
    doc.line(margin, y + 1.5, W - margin, y + 1.5)
  }

  const body = (text, y, size = 9, color = TEXT) => {
    doc.setFontSize(size)
    doc.setTextColor(...color)
    doc.text(text, margin, y)
  }

  const tableRow = (cols, y, isHeader = false) => {
    const colW = textW / cols.length
    if (isHeader) {
      doc.setFillColor(...CARD)
      doc.rect(margin, y - 4, textW, 7, 'F')
    }
    cols.forEach((text, i) => {
      doc.setFontSize(8)
      doc.setTextColor(...(isHeader ? ACCENT : GRAY))
      doc.text(String(text), margin + i * colW + 2, y)
    })
  }

  const newPage = () => {
    doc.addPage()
    bg(0, 0, W, H, DARK)
  }

  // ─── Page 1: Title ───────────────────────────────────────────────────────────
  bg(0, 0, W, H, DARK)
  bg(0, 0, W, 60, CARD)

  doc.setFontSize(26)
  doc.setTextColor(...ACCENT)
  doc.text('PID Controller Tuning Report', W / 2, 28, { align: 'center' })

  doc.setFontSize(12)
  doc.setTextColor(...TEXT)
  doc.text('PID Optimal Tuner v1.0', W / 2, 40, { align: 'center' })

  doc.setFontSize(9)
  doc.setTextColor(...GRAY)
  const now = new Date()
  doc.text(`Generated: ${now.toLocaleString()}`, W / 2, 50, { align: 'center' })
  doc.text('Author: Yuriy Romasevych — romasevichyuriy@ukr.net', W / 2, 57, { align: 'center' })

  let y = 80
  heading('Summary', y)
  y += 10

  const optimizerName = optimizer.selected
  const metrics = results.metrics || {}
  const kp = results.kp || 0, ki = results.ki || 0, kd = results.kd || 0

  const summaryRows = [
    ['Parameter', 'Value'],
    ['Optimizer', optimizerName],
    ['kp (parallel)', kp.toFixed(4)],
    ['ki (parallel)', ki.toFixed(4)],
    ['kd (parallel)', kd.toFixed(4)],
    ['Kp (standard)', kp.toFixed(4)],
    ['Ti (standard)', ki > 0 ? (kp / ki).toFixed(4) + ' s' : '∞'],
    ['Td (standard)', kp > 0 ? (kd / kp).toFixed(4) + ' s' : '0'],
    ['Final f_OF', (results.finalCost || 0).toExponential(6)],
    ['All Constraints Met', results.allConstraintsMet ? 'Yes' : 'No'],
  ]
  summaryRows.forEach((row, i) => {
    tableRow(row, y + i * 7, i === 0)
  })

  // ─── Page 2: System Model ────────────────────────────────────────────────────
  newPage()
  y = 25
  heading('System Model', y, 14)
  y += 12

  body(`Method: ${plant.method === 'tf' ? 'Manual Transfer Function' : 'System Identification'}`, y)
  y += 8

  const num = plant.num, den = plant.den
  const numStr = num.map((v, i) => v !== 0 ? (i === 0 ? `${v}` : `${v}s^${i}`) : null).filter(Boolean).join(' + ') || '0'
  const denStr = den.map((v, i) => v !== 0 ? (i === 0 ? `${v}` : `${v}s^${i}`) : null).filter(Boolean).join(' + ') || '0'

  body(`Transfer Function G(s) = [${numStr}] / [${denStr}]${plant.delay > 0 ? ` · exp(-${plant.delay}s)` : ''}`, y, 8)
  y += 10

  const tfTable = [
    ['Coefficient', 'Value'],
    ['b0 (numerator)', String(num[0] || 0)],
    ['b1', String(num[1] || 0)],
    ['b2', String(num[2] || 0)],
    ['a0 (denominator)', String(den[0] || 0)],
    ['a1', String(den[1] || 0)],
    ['a2', String(den[2] || 0)],
    ['a3', String(den[3] || 0)],
    ['a4', String(den[4] || 0)],
    ['Delay L (s)', String(plant.delay || 0)],
  ]
  tfTable.forEach((row, i) => tableRow(row, y + i * 7, i === 0))

  // ─── Page 3: Optimization Setup ─────────────────────────────────────────────
  newPage()
  y = 25
  heading('Optimization Setup', y, 14)
  y += 12

  body('Active Criteria:', y, 10, ACCENT)
  y += 8
  const criteriaNames = { w1: 'ITAE', w2: 'IAE', w3: 'ISE', w4: 'ITSE', w5: 'Overshoot', w6: 'Rise Time', w7: 'Settling Time', w8: 'Steady-state Error' }
  const activeCriteria = [['Criterion', 'Weight'], ...Object.entries(criterion.weights)
    .filter(([k]) => criterion.enabled[k])
    .map(([k, v]) => [criteriaNames[k], v.toFixed(3)])]
  activeCriteria.forEach((row, i) => tableRow(row, y + i * 7, i === 0))
  y += activeCriteria.length * 7 + 8

  body('Constraints:', y, 10, ACCENT)
  y += 8
  const constraintRows = [
    ['Constraint', 'Value'],
    ['Overshoot limit', criterion.useOvershootConstraint ? `${criterion.overshootMax}%` : 'None'],
    ['Control u_min', criterion.useControlConstraint ? String(criterion.uMin) : 'None'],
    ['Control u_max', criterion.useControlConstraint ? String(criterion.uMax) : 'None'],
  ]
  constraintRows.forEach((row, i) => tableRow(row, y + i * 7, i === 0))
  y += constraintRows.length * 7 + 8

  body('Optimizer Parameters:', y, 10, ACCENT)
  y += 8
  const optRows = [
    ['Parameter', 'Value'],
    ['Algorithm', optimizer.selected],
    ['Population', '25'],
    ['Iterations', '200'],
    ['kp bounds', '[0, 100]'],
    ['ki bounds', '[0, 100]'],
    ['kd bounds', '[0, 100]'],
  ]
  optRows.forEach((row, i) => tableRow(row, y + i * 7, i === 0))

  // ─── Page 4: Convergence ─────────────────────────────────────────────────────
  newPage()
  y = 25
  heading('Optimization Convergence', y, 14)
  y += 12

  const conv = results.convergence || []
  if (conv.length > 0) {
    // Render convergence chart to image
    const convDiv = document.createElement('div')
    convDiv.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:600px;height:250px;'
    document.body.appendChild(convDiv)
    try {
      await Plotly.newPlot(convDiv, [{
        x: conv.map((_, i) => i),
        y: conv,
        type: 'scatter',
        mode: 'lines',
        line: { color: '#3b82f6', width: 2 },
      }], {
        paper_bgcolor: '#1a1f2e',
        plot_bgcolor: '#0f1117',
        font: { color: '#9ca3af' },
        margin: { l: 50, r: 20, t: 20, b: 40 },
        xaxis: { title: { text: 'Iteration' }, gridcolor: '#2a3040' },
        yaxis: { title: { text: 'f_OF' }, type: 'log', gridcolor: '#2a3040' },
      }, { staticPlot: true })
      const imgData = await Plotly.toImage(convDiv, { format: 'png', width: 600, height: 250 })
      doc.addImage(imgData, 'PNG', margin, y, textW, 90)
      y += 95
    } catch {}
    document.body.removeChild(convDiv)
  }

  body(`Final f_OF = ${(results.finalCost || 0).toExponential(6)}`, y, 9)
  y += 7
  body(`Status: ${results.statusMessage || 'N/A'}`, y, 8, results.allConstraintsMet ? GREEN : [245, 158, 11])

  // ─── Page 5: Time Domain Results ─────────────────────────────────────────────
  newPage()
  y = 25
  heading('Tuning Results — Time Domain', y, 14)
  y += 12

  // PID table
  const pidTable = [
    ['Parameter', 'Parallel Form', 'Standard Form'],
    ['Kp / kp', kp.toFixed(4), kp.toFixed(4)],
    ['Ki→Ti', ki.toFixed(4), ki > 0 ? `Ti = ${(kp / ki).toFixed(4)} s` : '∞'],
    ['Kd→Td', kd.toFixed(4), kp > 0 ? `Td = ${(kd / kp).toFixed(4)} s` : '0'],
  ]
  pidTable.forEach((row, i) => {
    const colW = textW / 3
    if (i === 0) { doc.setFillColor(...CARD); doc.rect(margin, y - 4, textW, 7, 'F') }
    row.forEach((text, j) => {
      doc.setFontSize(8)
      doc.setTextColor(...(i === 0 ? ACCENT : GRAY))
      doc.text(String(text), margin + j * colW + 2, y)
    })
    y += 7
  })
  y += 5

  // Step response chart
  const simData = results.simData
  if (simData) {
    const chartDiv = document.createElement('div')
    chartDiv.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:600px;height:200px;'
    document.body.appendChild(chartDiv)
    try {
      await Plotly.newPlot(chartDiv, [
        { x: simData.t, y: simData.y, type: 'scatter', mode: 'lines', name: 'y(t)', line: { color: '#3b82f6', width: 2 } },
        { x: [simData.t[0], simData.t[simData.t.length - 1]], y: [1, 1], mode: 'lines', name: 'r', line: { color: '#10b981', dash: 'dash', width: 1 } },
      ], {
        paper_bgcolor: '#1a1f2e', plot_bgcolor: '#0f1117', font: { color: '#9ca3af' },
        margin: { l: 50, r: 20, t: 15, b: 40 },
        xaxis: { title: { text: 'Time (s)' }, gridcolor: '#2a3040' },
        yaxis: { title: { text: 'y(t)' }, gridcolor: '#2a3040' },
      }, { staticPlot: true })
      const imgData = await Plotly.toImage(chartDiv, { format: 'png', width: 600, height: 200 })
      doc.addImage(imgData, 'PNG', margin, y, textW, 65)
      y += 68
    } catch {}
    document.body.removeChild(chartDiv)
  }

  // Metrics table
  const metricsTable = [
    ['Metric', 'Value'],
    ['ITAE', (metrics.ITAE || 0).toFixed(4)],
    ['IAE', (metrics.IAE || 0).toFixed(4)],
    ['ISE', (metrics.ISE || 0).toFixed(4)],
    ['ITSE', (metrics.ITSE || 0).toFixed(4)],
    ['Overshoot', `${(metrics.overshoot || 0).toFixed(2)}%`],
    ['Rise Time', `${(metrics.riseTime || 0).toFixed(4)} s`],
    ['Settling Time', `${(metrics.settlingTime || 0).toFixed(4)} s`],
    ['Steady-state Error', (metrics.ess || 0).toFixed(6)],
  ]
  metricsTable.forEach((row, i) => tableRow(row, y + i * 7, i === 0))

  // ─── Page 6: Frequency Domain ────────────────────────────────────────────────
  newPage()
  y = 25
  heading('Tuning Results — Frequency Domain', y, 14)
  y += 12

  const bode = results.freqData
  if (bode) {
    const bodeDiv = document.createElement('div')
    bodeDiv.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:600px;height:280px;'
    document.body.appendChild(bodeDiv)
    try {
      await Plotly.newPlot(bodeDiv, [
        { x: bode.freqs, y: bode.mag, type: 'scatter', mode: 'lines', name: 'Mag (dB)', line: { color: '#3b82f6', width: 2 }, yaxis: 'y' },
        { x: bode.freqs, y: bode.phase, type: 'scatter', mode: 'lines', name: 'Phase (°)', line: { color: '#f59e0b', width: 2 }, yaxis: 'y2' },
      ], {
        paper_bgcolor: '#1a1f2e', plot_bgcolor: '#0f1117', font: { color: '#9ca3af' },
        margin: { l: 55, r: 55, t: 15, b: 40 },
        xaxis: { type: 'log', title: { text: 'ω (rad/s)' }, gridcolor: '#2a3040' },
        yaxis: { title: { text: 'Magnitude (dB)' }, gridcolor: '#2a3040' },
        yaxis2: { title: { text: 'Phase (°)' }, overlaying: 'y', side: 'right' },
      }, { staticPlot: true })
      const imgData = await Plotly.toImage(bodeDiv, { format: 'png', width: 600, height: 280 })
      doc.addImage(imgData, 'PNG', margin, y, textW, 95)
      y += 100
    } catch {}
    document.body.removeChild(bodeDiv)

    const stabilityTable = [
      ['Stability Margin', 'Value', 'Status'],
      ['Gain Margin', isFinite(bode.gainMargin) ? `${bode.gainMargin.toFixed(2)} dB` : '∞', bode.gainMargin > 6 ? 'OK (>6 dB)' : 'WARNING'],
      ['Phase Margin', isFinite(bode.phaseMargin) ? `${bode.phaseMargin.toFixed(2)}°` : '∞', bode.phaseMargin > 30 ? 'OK (>30°)' : 'WARNING'],
      ['Gain Crossover Freq', bode.phaseMarginFreq ? `${bode.phaseMarginFreq.toFixed(3)} rad/s` : 'N/A', ''],
      ['Phase Crossover Freq', bode.gainMarginFreq ? `${bode.gainMarginFreq.toFixed(3)} rad/s` : 'N/A', ''],
    ]
    stabilityTable.forEach((row, i) => {
      const colW = textW / 3
      if (i === 0) { doc.setFillColor(...CARD); doc.rect(margin, y - 4, textW, 7, 'F') }
      row.forEach((text, j) => {
        doc.setFontSize(8)
        const isWarning = text === 'WARNING'
        doc.setTextColor(...(i === 0 ? ACCENT : isWarning ? [239, 68, 68] : GRAY))
        doc.text(String(text), margin + j * colW + 2, y)
      })
      y += 7
    })
  }

  // Footer on all pages
  const totalPages = doc.internal.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    doc.setFontSize(7)
    doc.setTextColor(...GRAY)
    doc.text(`PID Optimal Tuner — Page ${p} of ${totalPages}`, W / 2, H - 8, { align: 'center' })
  }

  doc.save('PID_Tuning_Report.pdf')
}
