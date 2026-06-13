import React, { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import useStore from '../store/useStore'
import PlotlyChart from '../components/PlotlyChart'
import { simulate, computeSimParams } from '../math/simulation'

export default function ModelPage() {
  const navigate = useNavigate()
  const { plant, setPlant } = useStore()

  const [tab, setTab] = useState(plant.method)
  const [identText, setIdentText] = useState('')
  const [identRunning, setIdentRunning] = useState(false)
  const [identResult, setIdentResult] = useState(null)
  const [previewData, setPreviewData] = useState(null)
  const [previewError, setPreviewError] = useState('')

  // Transfer function coefficients (numerator max 1st order: b₀, b₁)
  const [num, setNum] = useState([(plant.num[0] ?? 0), (plant.num[1] ?? 0)])
  const [den, setDen] = useState(plant.den)
  const [delay, setDelay] = useState(plant.delay)
  const [order, setOrder] = useState(plant.order)

  // Compute preview when TF changes
  const computePreview = useCallback(() => {
    try {
      const { dt, T } = computeSimParams(den, delay)
      const result = simulate(num, den, delay, 0, 0, 0, { dt, T, r: 1, openLoop: true })
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
      const parts = line.split(/[,;\t ]+/)
      if (parts.length >= 2) {
        const t = parseFloat(parts[0])
        const y = parseFloat(parts[1])
        if (!isNaN(t) && !isNaN(y)) points.push({ t, y })
      }
    }
    if (points.length < 10) {
      setPreviewError('Need at least 10 data points (t, y)')
      return
    }

    setIdentRunning(true)
    setPreviewError('')
    try {
      const { identifyTF } = await import('../math/identification.js')
      const tArr = points.map(p => p.t)
      const yArr = points.map(p => p.y)
      const identOrder = plant.identOrder
      const useDelay = plant.identDelay
      const result = identifyTF(tArr, yArr, identOrder, useDelay)
      setIdentResult(result)
      setPreviewData({ t: result.predicted.t, y: result.predicted.y, rawT: tArr, rawY: yArr })
    } catch (err) {
      setPreviewError('Identification failed: ' + err.message)
    }
    setIdentRunning(false)
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
        identData: previewData ? { t: previewData.rawT, y: previewData.rawY } : null,
      })
    }
    navigate('/criterion')
  }

  const tfDisplay = () => {
    const numStr = num.map((v, i) => {
      if (v === 0) return null
      const term = i === 0 ? `${v}` : i === 1 ? `${v}s` : `${v}s^${i}`
      return term
    }).filter(Boolean).join(' + ') || '0'
    const denStr = den.map((v, i) => {
      if (v === 0) return null
      const term = i === 0 ? `${v}` : i === 1 ? `${v}s` : `${v}s^${i}`
      return term
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
          className={`px-5 py-2 rounded-lg font-medium text-sm transition-all ${tab === 'tf' ? 'tab-active' : 'tab-inactive'}`}
        >
          ⚙️ Transfer Function
        </button>
        <button
          onClick={() => { setTab('ident'); setPlant({ method: 'ident' }) }}
          className={`px-5 py-2 rounded-lg font-medium text-sm transition-all ${tab === 'ident' ? 'tab-active' : 'tab-inactive'}`}
        >
          📈 System Identification
        </button>
      </div>

      {tab === 'tf' && (
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-6 animate-slide-up">
          {/* TF Input */}
          <div className="card space-y-5">
            <h2 className="font-semibold text-gray-900">Transfer Function G(s)</h2>

            {/* TF reference image */}
            <div className="rounded-lg border border-dark-border overflow-hidden bg-white">
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
          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-1">Step Response Preview</h2>
            <div className="text-gray-600 text-xl mb-4 font-mono border border-dark-border rounded p-4 bg-dark-bg leading-relaxed">
              G(s) = [{numStr}] / [{denStr}]{delay > 0 ? ` · e^(-${delay}s)` : ''}
            </div>
            {previewError && <p className="text-red-400 text-sm mb-3">{previewError}</p>}
            {previewData ? (
              <PlotlyChart
                id="tf-preview"
                data={[{
                  x: previewData.t,
                  y: previewData.y,
                  type: 'scatter',
                  mode: 'lines',
                  name: 'y(t)',
                  line: { color: '#3b82f6', width: 2 },
                }]}
                layout={{
                  title: { text: 'Open-loop Step Response', font: { size: 13 } },
                  xaxis: { title: { text: 'Time (s)' } },
                  yaxis: { title: { text: 'Output y(t)' } },
                  height: 280,
                }}
              />
            ) : (
              <div className="flex items-center justify-center h-64 text-gray-600 text-sm">
                Click "Preview" to show step response
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'ident' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-slide-up">
          {/* Input */}
          <div className="card space-y-4">
            <h2 className="font-semibold text-gray-900">Step Response Data</h2>
            <p className="text-gray-500 text-xs">
              Paste CSV data: two columns (time, output), separated by comma, semicolon, tab or space.
              Minimum 10 points. Data is assumed to be a unit step response (input = 1 at t=0).
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Model Order (1–4)</label>
                <select
                  value={plant.identOrder}
                  onChange={e => setPlant({ identOrder: parseInt(e.target.value) })}
                  className="input-field"
                >
                  {[1, 2, 3, 4].map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 cursor-pointer text-gray-600 text-sm">
                  <input
                    type="checkbox"
                    checked={plant.identDelay}
                    onChange={e => setPlant({ identDelay: e.target.checked })}
                    className="w-4 h-4"
                  />
                  Include Delay
                </label>
              </div>
            </div>

            <div>
              <label className="label">Data (CSV/tab-separated)</label>
              <textarea
                value={identText}
                onChange={e => setIdentText(e.target.value)}
                className="input-field font-mono text-xs resize-none"
                rows={12}
                placeholder="0.0, 0.000&#10;0.1, 0.095&#10;0.2, 0.181&#10;..."
              />
            </div>

            <button
              onClick={handleIdentify}
              disabled={identRunning || !identText.trim()}
              className="btn-primary w-full"
            >
              {identRunning ? '⏳ Identifying...' : '🔍 Identify System'}
            </button>

            {identResult && (
              <div className="bg-dark-bg rounded-lg p-3 border border-accent-green/30 text-xs space-y-1">
                <p className="text-accent-green font-medium">✓ Identification complete</p>
                <p className="text-gray-600">MSE: <span className="text-accent-cyan font-mono">{identResult.mse.toExponential(3)}</span></p>
                <p className="text-gray-600 font-mono text-xs">
                  num: [{identResult.num.map(v => v.toFixed(4)).join(', ')}]
                </p>
                <p className="text-gray-600 font-mono text-xs">
                  den: [{identResult.den.map(v => v.toFixed(4)).join(', ')}]
                </p>
                {identResult.delay > 0 && (
                  <p className="text-gray-600">Delay: <span className="font-mono text-accent-cyan">{identResult.delay.toFixed(3)} s</span></p>
                )}
              </div>
            )}
          </div>

          {/* Plot */}
          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-3">Identification Result</h2>
            {previewData ? (
              <PlotlyChart
                id="ident-preview"
                data={[
                  previewData.rawT && {
                    x: previewData.rawT,
                    y: previewData.rawY,
                    type: 'scatter',
                    mode: 'markers',
                    name: 'Measured',
                    marker: { color: '#f59e0b', size: 5 },
                  },
                  {
                    x: previewData.t,
                    y: previewData.y,
                    type: 'scatter',
                    mode: 'lines',
                    name: 'Model',
                    line: { color: '#3b82f6', width: 2 },
                  },
                ].filter(Boolean)}
                layout={{
                  title: { text: 'Data vs Identified Model', font: { size: 13 } },
                  xaxis: { title: { text: 'Time (s)' } },
                  yaxis: { title: { text: 'Output' } },
                  height: 320,
                }}
              />
            ) : (
              <div className="flex items-center justify-center h-64 text-gray-600 text-sm">
                Run identification to see results
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
