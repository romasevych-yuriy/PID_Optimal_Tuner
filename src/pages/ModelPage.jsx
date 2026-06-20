import React, { useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import useStore, { polynomialRoots } from '../store/useStore'
import PlotlyChart from '../components/PlotlyChart'
import { simulate, computeSimParams } from '../math/simulation'
import { DEFAULT_IDENT_DATA } from '../data/defaultIdentData'

function roundSig(v, sig) {
  if (!isFinite(v) || v === 0) return v
  const d = Math.ceil(Math.log10(Math.abs(v)))
  const magnitude = Math.pow(10, sig - d)
  return Math.round(v * magnitude) / magnitude
}

// Quadrants ordered by tie-break preference: bottomRight > bottomLeft > topRight > topLeft
const LEGEND_QUADRANTS = [
  { name: 'bottomRight', x: 0.98, y: 0.02, xanchor: 'right',  yanchor: 'bottom', check: (p, xm, ym) => p.re >= xm && p.im <= ym },
  { name: 'bottomLeft',  x: 0.02, y: 0.02, xanchor: 'left',   yanchor: 'bottom', check: (p, xm, ym) => p.re <= xm && p.im <= ym },
  { name: 'topRight',    x: 0.98, y: 0.98, xanchor: 'right',  yanchor: 'top',    check: (p, xm, ym) => p.re >= xm && p.im >= ym },
  { name: 'topLeft',     x: 0.02, y: 0.98, xanchor: 'left',   yanchor: 'top',    check: (p, xm, ym) => p.re <= xm && p.im >= ym },
]

function findBestLegendPosition(poles, zeros, xMin, xMax, yMin, yMax) {
  const allPoints = [...poles, ...zeros]
  const xMid = (xMax + xMin) / 2
  const yMid = (yMax + yMin) / 2
  const counts = LEGEND_QUADRANTS.map(q => ({
    ...q,
    count: allPoints.filter(p => q.check(p, xMid, yMid)).length,
  }))
  return counts.reduce((best, cur) => cur.count < best.count ? cur : best)
}

export default function ModelPage() {
  const navigate = useNavigate()
  const { plant, setPlant } = useStore()

  const [tab, setTab] = useState(plant.method)
  const [identText, setIdentText] = useState(DEFAULT_IDENT_DATA)
  const [identRunning, setIdentRunning] = useState(false)
  const [identResult, setIdentResult] = useState(null)
  const [previewData, setPreviewData] = useState(null)
  const [identPreviewData, setIdentPreviewData] = useState(null)
  const [previewError, setPreviewError] = useState('')

  // Transfer function coefficients (numerator max 1st order: b₀, b₁)
  const [num, setNum] = useState([(plant.num[0] ?? 0), (plant.num[1] ?? 0)])
  const [den, setDen] = useState(plant.den)
  const [delay, setDelay] = useState(plant.delay)
  const [order, setOrder] = useState(plant.order)

  // Pole-Zero Map — derived from current coefficients
  const pzMap = useMemo(() => {
    // Poles: roots of active denominator (descending order)
    let poles = []
    try {
      const activeDen = den.slice(0, order + 1)
      const n = activeDen.length - 1
      if (n > 0) {
        const an = activeDen[n]
        const poly = []
        for (let i = n; i >= 0; i--) poly.push(activeDen[i] / an)
        poles = polynomialRoots(poly)
      }
    } catch (_) {}

    // Zeros: numerator b0 + b1*s → single zero at s = -b0/b1
    const zeros = []
    const b0 = num[0] ?? 0
    const b1 = num[1] ?? 0
    if (Math.abs(b1) > 1e-12) zeros.push({ re: -b0 / b1, im: 0 })

    const stable = poles.length > 0 && poles.every(p => p.re < -1e-9)

    const allPoints = [...poles, ...zeros]
    let legendPos
    if (allPoints.length === 0) {
      legendPos = { x: 0.98, y: 0.02, xanchor: 'right', yanchor: 'bottom' }
    } else {
      const xMin = Math.min(...allPoints.map(p => p.re)) - 0.5
      const xMax = Math.max(...allPoints.map(p => p.re)) + 0.5
      const yMin = Math.min(...allPoints.map(p => p.im)) - 0.5
      const yMax = Math.max(...allPoints.map(p => p.im)) + 0.5
      legendPos = findBestLegendPosition(poles, zeros, xMin, xMax, yMin, yMax)
    }

    return { poles, zeros, stable, legendPos }
  }, [num, den, order])

  // Compute preview when TF changes
  const computePreview = useCallback(() => {
    try {
      const { dt, T } = computeSimParams(den, delay)
      const rFn = (t) => t < 0.7 * T ? 1.0 : 0.75
      const result = simulate(num, den, delay, 0, 0, 0, { dt, T, r: rFn, openLoop: true })
      setPreviewData(result)
      setPreviewError('')
    } catch (err) {
      setPreviewError('Invalid transfer function: ' + err.message)
      setPreviewData(null)
    }
  }, [num, den, delay])

  React.useEffect(() => { if (tab === 'tf') computePreview() }, [tab, computePreview])

  // Handle order change
  const handleOrderChange = (newOrder) => {
    setOrder(newOrder)
    const newDen = Array(newOrder + 1).fill(0)
    newDen[0] = den[0] || 1
    for (let i = 1; i <= Math.min(newOrder, den.length - 1); i++) {
      newDen[i] = den[i] || 0
    }
    newDen[newOrder] = den[newOrder] || 1
    setDen(newDen)
  }

  const handleNumChange = (idx, val) => {
    const n = [...num]
    n[idx] = parseFloat(val) || 0
    setNum(n)
  }

  const handleDenChange = (idx, val) => {
    const d = [...den]
    d[idx] = parseFloat(val) || 0
    setDen(d)
  }

  // Identification
  const handleIdentify = async () => {
    const lines = identText.trim().split('\n').filter(l => l.trim())
    const points = []
    for (const line of lines) {
      // Tab/semicolon split first to preserve European decimal commas within values
      let parts = line.trim().split(/[\t;]+/)
      if (parts.length < 3) parts = line.trim().split(/[,\t;\s]+/)
      if (parts.length >= 3) {
        const t = parseFloat(parts[0].replace(',', '.'))
        const u = parseFloat(parts[1].replace(',', '.'))
        const y = parseFloat(parts[2].replace(',', '.'))
        if (!isNaN(t) && !isNaN(u) && !isNaN(y)) points.push({ t, u, y })
      }
    }
    if (points.length < 20) {
      setPreviewError('Need at least 20 data points (t, u, y)')
      return
    }

    setIdentRunning(true)
    setPreviewError('')
    try {
      const { identifyTF } = await import('../math/identification.js')
      const tArr = points.map(p => p.t)
      const uArr = points.map(p => p.u)
      const yArr = points.map(p => p.y)
      const identOrder = plant.identOrder
      const useDelay = plant.identDelay
      const result = identifyTF(tArr, yArr, identOrder, useDelay, uArr)
      result.num = result.num.map(v => roundSig(v, 4))
      result.den = result.den.map(v => roundSig(v, 4))
      result.delay = roundSig(result.delay, 4)
      setIdentResult(result)
      setIdentPreviewData({ t: result.predicted.t, y: result.predicted.y, rawT: tArr, rawY: yArr, rawU: uArr })
    } catch (err) {
      setPreviewError('Identification failed: ' + err.message)
    }
    setIdentRunning(false)
  }

  const handlePassToTF = () => {
    if (!identResult) return
    const newOrder = identResult.den.length - 1
    const newNum = [identResult.num[0] ?? 0, identResult.num[1] ?? 0]
    const newDen = identResult.den.slice()
    const newDelay = identResult.delay
    setNum(newNum)
    setDen(newDen)
    setDelay(newDelay)
    setOrder(newOrder)
    setPlant({ method: 'tf', num: newNum, den: newDen, delay: newDelay, order: newOrder })
    setTab('tf')
  }

  const handleNext = () => {
    if (tab === 'tf') {
      setPlant({ method: 'tf', num, den, delay, order })
    } else if (identResult) {
      setPlant({
        method: 'ident',
        num: identResult.num,
        den: identResult.den,
        delay: identResult.delay,
        order: identResult.den.length - 1,
        identData: identPreviewData ? { t: identPreviewData.rawT, y: identPreviewData.rawY } : null,
      })
    }
    navigate('/criterion')
  }

  const tfDisplay = () => {
    const fmt = v => v < 0 ? `(${v})` : `${v}`
    const numStr = num.map((v, i) => {
      if (v === 0) return null
      return i === 0 ? fmt(v) : i === 1 ? `${fmt(v)}s` : `${fmt(v)}s^${i}`
    }).filter(Boolean).join(' + ') || '0'
    const denStr = den.map((v, i) => {
      if (v === 0) return null
      return i === 0 ? fmt(v) : i === 1 ? `${fmt(v)}s` : `${fmt(v)}s^${i}`
    }).filter(Boolean).join(' + ') || '0'
    return { numStr, denStr }
  }

  const { numStr, denStr } = tfDisplay()
  const { dt: dtCalc, T: tCalc } = computeSimParams(den, delay)

  return (
    <div className="animate-fade-in space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="section-title text-2xl">Model Setting / Identification</h1>
        <p className="section-subtitle">Define your plant transfer function or identify it from experimental data.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => { setTab('tf'); setPlant({ method: 'tf' }) }}
          className={`px-5 py-2 rounded-lg font-bold transition-all ${tab === 'tf' ? 'tab-active' : 'tab-inactive'}`}
          style={{ fontSize: '1.05rem' }}
        >
          <span className="flex items-center gap-1.5"><i className="ti ti-math-function" /> Transfer Function</span>
        </button>
        <button
          onClick={() => { setTab('ident'); setPlant({ method: 'ident' }) }}
          className={`px-5 py-2 rounded-lg font-bold transition-all ${tab === 'ident' ? 'tab-active' : 'tab-inactive'}`}
          style={{ fontSize: '1.05rem' }}
        >
          <span className="flex items-center gap-1.5"><i className="ti ti-chart-dots" /> System Identification</span>
        </button>
      </div>

      {tab === 'tf' && (
        <div className="flex flex-col lg:flex-row gap-6 animate-slide-up">
          {/* TF Input */}
          <div className="card space-y-5 lg:w-96 shrink-0">
            <h2 className="font-semibold text-gray-900">Transfer Function G(s)</h2>

            {/* TF reference image */}
            <div className="rounded-lg overflow-hidden">
              <img
                src="TF_No_L.png"
                alt="Transfer Function structure"
                className="w-full object-contain block"
              />
            </div>

            {/* System order */}
            <div>
              <label className="label text-base font-semibold">Set System Order (1–4)</label>
              <div className="flex gap-2 mt-1">
                {[
                  { o: 1, label: '1st' },
                  { o: 2, label: '2nd' },
                  { o: 3, label: '3rd' },
                  { o: 4, label: '4th' },
                ].map(({ o, label }) => (
                  <button
                    key={o}
                    onClick={() => handleOrderChange(o)}
                    className={`flex-1 py-2.5 rounded-lg text-base font-semibold transition-all ${order === o ? 'bg-accent-blue text-white' : 'bg-dark-bg border border-dark-border text-gray-700 hover:text-gray-900'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Numerator — b₀, b₁ only */}
            <div>
              <p className="text-gray-700 text-lg font-semibold mb-2">Numerator</p>
              <div className="space-y-3">
                {[{ i: 0, label: 'B₀' }, { i: 1, label: 'B₁' }].map(({ i, label }) => (
                  <div key={i} className="flex items-center gap-4">
                    <span className="text-gray-600 text-lg font-medium w-9 shrink-0">{label}</span>
                    <input
                      type="number"
                      value={num[i] ?? 0}
                      onChange={e => handleNumChange(i, e.target.value)}
                      className="input-field text-base"
                      style={{ maxWidth: 140 }}
                      step="0.01"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Denominator — always show A₀–A₄, grey out beyond order */}
            <div>
              <p className="text-gray-700 text-lg font-semibold mb-2">Denominator</p>
              <div className="space-y-3">
                {[
                  { i: 0, label: 'A₀' },
                  { i: 1, label: 'A₁' },
                  { i: 2, label: 'A₂' },
                  { i: 3, label: 'A₃' },
                  { i: 4, label: 'A₄' },
                ].map(({ i, label }) => {
                  const active = i <= order
                  return (
                    <div key={i} className="flex items-center gap-4">
                      <span className={`text-lg font-medium w-9 shrink-0 ${active ? 'text-gray-600' : 'text-gray-400'}`}>{label}</span>
                      <input
                        type="number"
                        value={active ? (den[i] ?? 0) : 0}
                        onChange={e => active && handleDenChange(i, e.target.value)}
                        disabled={!active}
                        className={`input-field text-base ${!active ? 'opacity-40 cursor-not-allowed' : ''}`}
                        style={{ maxWidth: 140 }}
                        step="0.01"
                      />
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Delay */}
            <div>
              <p className="text-gray-700 text-lg font-semibold mb-2">Transport Delay L (s)</p>
              <input
                type="number"
                value={delay}
                onChange={e => setDelay(parseFloat(e.target.value) || 0)}
                className="input-field text-base"
                style={{ maxWidth: 140 }}
                min="0"
                step="0.01"
              />
            </div>

            {/* Auto-calculated params */}
            <div className="bg-dark-bg rounded-lg p-3 border border-dark-border text-xs space-y-1">
              <p className="text-gray-600 font-medium mb-1">Auto-computed simulation parameters:</p>
              <p className="text-gray-500">Integration step <span className="text-accent-cyan font-mono">dt = {dtCalc.toExponential(2)} s</span></p>
              <p className="text-gray-500">Simulation time <span className="text-accent-cyan font-mono">T = {tCalc.toFixed(2)} s</span></p>
            </div>
          </div>

          {/* Preview */}
          <div className="card flex-1 min-w-0">
            <h2 className="font-semibold text-gray-900 mb-1">Step Response Preview</h2>
            <div className="text-gray-600 mb-4 font-mono font-bold border border-dark-border rounded p-4 bg-dark-bg leading-relaxed" style={{ fontSize: '1.15rem' }}>
              G(s) = [{numStr}] / [{denStr}]{delay > 0 ? ` · e^(-${delay}s)` : ''}
            </div>
            {previewError && <p className="text-red-400 text-sm mb-3">{previewError}</p>}
            {previewData ? (
              <PlotlyChart
                id="tf-preview"
                data={[
                  {
                    x: previewData.t,
                    y: previewData.y,
                    type: 'scatter',
                    mode: 'lines',
                    name: '<b>y(t) — step response</b>',
                    line: { color: '#3b82f6', width: 3 },
                    cliponaxis: false,
                  },
                  {
                    x: previewData.t,
                    y: previewData.t.map(ti => ti < 0.7 * tCalc ? 1.0 : 0.75),
                    type: 'scatter',
                    mode: 'lines',
                    name: '<b>r(t) — setpoint</b>',
                    line: { color: '#ef4444', width: 3, shape: 'hv' },
                    cliponaxis: false,
                  },
                ]}
                layout={{
                  title: { text: '<b>Open-loop Step Response</b>', font: { size: 16 } },
                  xaxis: {
                    title: { text: 'Time (s)', font: { size: 14 } },
                    tickfont: { size: 13 },
                    range: [0, tCalc],
                    showline: true, mirror: true, linecolor: '#9ca3af', linewidth: 1.5,
                  },
                  yaxis: {
                    title: { text: 'Output y(t) / Setpoint r(t)', font: { size: 14 } },
                    tickfont: { size: 13 },
                    autorange: true,
                    rangemode: 'normal',
                    showline: true, mirror: true, linecolor: '#9ca3af', linewidth: 1.5,
                  },
                  legend: { x: 0.99, y: 0.01, xanchor: 'right', yanchor: 'bottom', font: { size: 15 } },
                  margin: { l: 70, r: 40, t: 50, b: 55 },
                  modebar: { orientation: 'v', bgcolor: 'rgba(255,255,255,0.8)' },
                  height: 420,
                }}
              />
            ) : (
              <div className="flex items-center justify-center h-64 text-gray-600 text-sm">
                Click "Preview" to show step response
              </div>
            )}

            {/* Pole-Zero Map */}
            <div className="mt-4 relative">
              <PlotlyChart
                id="pz-map"
                data={[
                  {
                    x: pzMap.zeros.map(z => z.re),
                    y: pzMap.zeros.map(z => z.im),
                    type: 'scatter',
                    mode: 'markers',
                    name: '<b>Zeros</b>',
                    marker: { symbol: 'circle-open', size: 14, color: '#3b82f6', line: { width: 2.5 } },
                  },
                  {
                    x: pzMap.poles.map(p => p.re),
                    y: pzMap.poles.map(p => p.im),
                    type: 'scatter',
                    mode: 'markers',
                    name: '<b>Poles</b>',
                    marker: { symbol: 'x', size: 14, color: '#ef4444', line: { width: 2.5 } },
                  },
                ]}
                layout={{
                  title: { text: '<b>Pole-Zero Map</b>', font: { size: 16 } },
                  xaxis: {
                    title: { text: 'Real (Re)', font: { size: 14 } },
                    tickfont: { size: 13 },
                    zeroline: false,
                    showline: true, mirror: true, linecolor: '#9ca3af', linewidth: 1.5,
                  },
                  yaxis: {
                    title: { text: 'Imaginary (Im)', font: { size: 14 } },
                    tickfont: { size: 13 },
                    zeroline: false,
                    showline: true, mirror: true, linecolor: '#9ca3af', linewidth: 1.5,
                  },
                  shapes: [
                    { type: 'line', x0: 0, x1: 0, y0: 0, y1: 1, xref: 'x', yref: 'paper', line: { color: '#9ca3af', dash: 'dash', width: 1.5 } },
                    { type: 'line', x0: 0, x1: 1, y0: 0, y1: 0, xref: 'paper', yref: 'y', line: { color: '#9ca3af', dash: 'dash', width: 1.5 } },
                  ],
                  showlegend: true,
                  legend: { x: pzMap.legendPos.x, y: pzMap.legendPos.y, xanchor: pzMap.legendPos.xanchor, yanchor: pzMap.legendPos.yanchor, bgcolor: 'rgba(255,255,255,0.85)', bordercolor: 'rgba(0,0,0,0.1)', borderwidth: 1, font: { size: 15 } },
                  margin: { l: 60, r: 40, t: 50, b: 40 },
                  modebar: { orientation: 'v', bgcolor: 'rgba(255,255,255,0.8)' },
                  height: 360,
                }}
              />
              {/* Stability badge — HTML overlay to avoid Plotly bgcolor transparency bug */}
              <div
                className={`absolute font-bold text-sm text-black px-3 py-1.5 rounded border-2 pointer-events-none ${
                  pzMap.stable
                    ? 'bg-green-300 border-green-500'
                    : 'bg-red-500 border-red-700'
                }`}
                style={{ top: 58, left: '50%', transform: 'translateX(-50%)' }}
              >
                {pzMap.stable ? '✓ Stable system' : '⚠ Unstable system'}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'ident' && (
        <div className="flex flex-col lg:flex-row gap-6 animate-slide-up">
          {/* Input */}
          <div className="card space-y-4 lg:w-96 shrink-0">
            <h2 className="font-semibold text-gray-900">Step Response Data</h2>
            <p className="text-gray-500 text-sm">
              Paste CSV data: three columns (time, input, output), separated by comma, semicolon, tab or space. Minimum 20 points.
            </p>

            <div>
              <p className="text-gray-700 text-lg font-semibold mb-2">Select Model Order (1–4)</p>
              <div className="flex gap-2">
                {[
                  { o: 1, label: '1st' },
                  { o: 2, label: '2nd' },
                  { o: 3, label: '3rd' },
                  { o: 4, label: '4th' },
                ].map(({ o, label }) => (
                  <button
                    key={o}
                    onClick={() => setPlant({ identOrder: o })}
                    className={`flex-1 py-2.5 rounded-lg text-base font-semibold transition-all ${plant.identOrder === o ? 'bg-accent-blue text-white' : 'bg-dark-bg border border-dark-border text-gray-700 hover:text-gray-900'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="mt-3">
                <label className="flex items-center gap-2 cursor-pointer text-gray-600 text-sm w-fit">
                  <input
                    type="checkbox"
                    checked={plant.identDelay}
                    onChange={e => setPlant({ identDelay: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <span>Include Delay</span>
                </label>
              </div>
            </div>

            <div>
              <p className="text-gray-700 text-lg font-semibold mb-2">Data (CSV/tab-separated)</p>
              <div
                className="font-mono font-bold text-white text-sm bg-gray-700 border border-dark-border border-b-0 px-3 py-1.5"
                style={{ whiteSpace: 'pre', tabSize: 8 }}
              >{'time\tinput\toutput'}</div>
              <textarea
                value={identText}
                onChange={e => setIdentText(e.target.value)}
                className="input-field font-mono text-sm resize-none wide-scroll"
                rows={10}
                style={{ overflowY: 'scroll', tabSize: 8, borderTop: 'none', borderRadius: 0 }}
              />
            </div>

            <button
              onClick={() => setIdentText('')}
              className="btn-danger w-full"
            >
              <span className="flex items-center justify-center gap-1.5"><i className="ti ti-eraser" /> Clear Table</span>
            </button>

            <button
              onClick={handleIdentify}
              disabled={identRunning || !identText.trim()}
              className="btn-primary w-full"
            >
              {identRunning ? '⏳ Identifying...' : <span className="flex items-center justify-center gap-1.5"><i className="ti ti-radar" /> Identify System</span>}
            </button>

          </div>

          {/* Plot */}
          <div className="card flex-1 min-w-0">
            <h2 className="font-semibold text-gray-900 mb-3">Identification Result</h2>
            {identPreviewData && identPreviewData.rawT ? (
              <PlotlyChart
                id="ident-preview"
                data={[
                  {
                    x: identPreviewData.rawT,
                    y: identPreviewData.rawU,
                    type: 'scatter',
                    mode: 'lines',
                    name: '<b>u(t) — input</b>',
                    line: { color: '#ef4444', width: 3 },
                    cliponaxis: false,
                  },
                  {
                    x: identPreviewData.rawT,
                    y: identPreviewData.rawY,
                    type: 'scatter',
                    mode: 'lines+markers',
                    name: '<b>y(t) — measured</b>',
                    line: { color: '#f59e0b', width: 2 },
                    marker: { color: '#f59e0b', size: 4 },
                    cliponaxis: false,
                  },
                  {
                    x: identPreviewData.t,
                    y: identPreviewData.y,
                    type: 'scatter',
                    mode: 'lines',
                    name: '<b>ŷ(t) — model</b>',
                    line: { color: '#3b82f6', width: 3 },
                    cliponaxis: false,
                  },
                ]}
                layout={{
                  title: { text: '<b>Data vs Identified Model</b>', font: { size: 16 } },
                  xaxis: {
                    title: { text: 'Time (s)', font: { size: 14 } },
                    tickfont: { size: 13 },
                    showline: true, mirror: true, linecolor: '#9ca3af', linewidth: 1.5,
                  },
                  yaxis: {
                    title: { text: 'Signal', font: { size: 14 } },
                    tickfont: { size: 13 },
                    showline: true, mirror: true, linecolor: '#9ca3af', linewidth: 1.5,
                  },
                  legend: { x: 0.99, y: 0.01, xanchor: 'right', yanchor: 'bottom', font: { size: 15 } },
                  margin: { l: 70, r: 40, t: 50, b: 55 },
                  modebar: { orientation: 'v', bgcolor: 'rgba(255,255,255,0.8)' },
                  height: 420,
                }}
              />
            ) : (
              <div className="flex items-center justify-center h-64 text-gray-600 text-sm">
                Run identification to see results
              </div>
            )}
            {identResult && !identRunning && (
              <div className="bg-dark-bg p-4 border border-accent-green/30 space-y-2 mt-4">
                <p className="text-accent-green font-bold text-base">✓ Identification complete</p>
                <p className="text-gray-700 font-bold text-sm">Mean Squared Error of Identification: <span className="text-accent-cyan font-mono">{identResult.mse.toExponential(3)}</span></p>
                <p className="text-gray-700 font-bold text-sm">Numerator coefficients: <span className="font-mono">[{identResult.num.map(v => v.toPrecision(4)).join(', ')}]</span></p>
                <p className="text-gray-700 font-bold text-sm">Denominator coefficients: <span className="font-mono">[{identResult.den.map(v => v.toPrecision(4)).join(', ')}]</span></p>
                {identResult.delay > 0 && (
                  <p className="text-gray-700 font-bold text-sm">Delay: <span className="font-mono text-accent-cyan">{identResult.delay.toPrecision(4)} s</span></p>
                )}
                <button onClick={handlePassToTF} className="btn-primary w-full mt-2">
                  Pass identified coefficients to Transfer Function
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Next button */}
      <div className="flex justify-end pt-2">
        <button
          onClick={handleNext}
          disabled={tab === 'ident' && !identResult}
          className="btn-primary px-8"
        >
          Next: Optimization Criterion →
        </button>
      </div>
    </div>
  )
}
