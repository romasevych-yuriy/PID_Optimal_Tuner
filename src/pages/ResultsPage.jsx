import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import useStore from '../store/useStore'
import PlotlyChart from '../components/PlotlyChart'
import { simulate, computeSimParams } from '../math/simulation'
import { computeMetrics, computeBode } from '../math/metrics'

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

export default function ResultsPage() {
  const navigate = useNavigate()
  const { plant, criterion, optimizer, results, setResults } = useStore()

  const [kp, setKp] = useState(results.kpAdj ?? 0)
  const [ki, setKi] = useState(results.kiAdj ?? 0)
  const [kd, setKd] = useState(results.kdAdj ?? 0)
  const [simData, setSimData] = useState(results.simData)
  const [metrics, setMetrics] = useState(results.metrics)
  const [bode, setBode] = useState(results.freqData)
  const [recomputing, setRecomputing] = useState(false)
  const [pdfGenerating, setPdfGenerating] = useState(false)

  const hasResults = results.kp !== null

  const recompute = useCallback(async (kpV, kiV, kdV) => {
    setRecomputing(true)
    try {
      const { dt, T } = computeSimParams(plant.den, plant.delay)
      const uMin = criterion.useControlConstraint ? criterion.uMin : -Infinity
      const uMax = criterion.useControlConstraint ? criterion.uMax : Infinity
      const res = simulate(plant.num, plant.den, plant.delay, kpV, kiV, kdV, { dt, T, r: 1, uMin, uMax })
      const m = computeMetrics(res.t, res.y, res.u, 1)
      const b = computeBode(plant.num, plant.den, plant.delay, kpV, kiV, kdV)
      setSimData(res)
      setMetrics(m)
      setBode(b)
      setResults({ kpAdj: kpV, kiAdj: kiV, kdAdj: kdV, simData: res, metrics: m, freqData: b })
    } catch {}
    setRecomputing(false)
  }, [plant, criterion, setResults])

  useEffect(() => {
    if (hasResults && !simData) {
      recompute(kp, ki, kd)
    }
  }, [hasResults])

  useEffect(() => {
    if (!hasResults) return
    const timeout = setTimeout(() => recompute(kp, ki, kd), 150)
    return () => clearTimeout(timeout)
  }, [kp, ki, kd])

  const handleExportPDF = async () => {
    if (pdfGenerating) return
    setPdfGenerating(true)
    try {
      const { generatePDF } = await import('../utils/pdfExport.js')
      await generatePDF({ plant, criterion, optimizer, results: { ...results, kp, ki, kd, metrics, simData, freqData: bode } })
    } finally {
      setPdfGenerating(false)
    }
  }

  const resetToOptimal = () => {
    setKp(results.kp)
    setKi(results.ki)
    setKd(results.kd)
  }

  if (!hasResults) {
    return (
      <div className="animate-fade-in text-center py-20">
        <div className="text-6xl mb-4">🔬</div>
        <h2 className="text-xl font-semibold text-gray-600 mb-2">No optimization results yet</h2>
        <p className="text-gray-700 mb-6">Run the optimizer first to see results.</p>
        <button onClick={() => navigate('/optimizer')} className="btn-primary">Go to Optimizer →</button>
      </div>
    )
  }

  // Standard form
  const Kp = kp
  const Ti = ki > 0 ? kp / ki : Infinity
  const Td = kp > 0 ? kd / kp : 0

  const metricRows = metrics ? [
    { label: 'ITAE', val: metrics.ITAE.toFixed(4) },
    { label: 'IAE',  val: metrics.IAE.toFixed(4) },
    { label: 'ISE',  val: metrics.ISE.toFixed(4) },
    { label: 'ITSE', val: metrics.ITSE.toFixed(4) },
    { label: 'Overshoot', val: `${metrics.overshoot.toFixed(2)}%` },
    { label: 'Rise Time', val: `${metrics.riseTime.toFixed(4)} s` },
    { label: 'Settling Time', val: `${metrics.settlingTime.toFixed(4)} s` },
    { label: 'Steady-state Error', val: metrics.ess.toFixed(6) },
  ] : []

  return (
    <div className="animate-fade-in space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="section-title text-2xl">Tuning Results</h1>
        <p className="section-subtitle">Inspect, adjust, and export your PID design.</p>
      </div>

      {/* Status */}
      {results.statusMessage && (
        <div className={`p-4 rounded-xl border font-bold ${results.allConstraintsMet ? 'border-accent-green/40 bg-accent-green/5 text-accent-green' : 'border-red-500/40 bg-red-500/5 text-red-500'}`}>
          {results.statusMessage}
        </div>
      )}

      {/* PID Gains — Interactive */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">PID Gains (Interactive)</h2>
          <button onClick={resetToOptimal} className="px-6 py-2 rounded-lg font-semibold text-white transition-all duration-200 bg-accent-green hover:bg-emerald-400 glow-green">
            ↺ Return to Optimization Result
          </button>
        </div>
        <div className="space-y-3 mb-4">
          {[
            { sub: 'p', val: kp, set: setKp, color: '#f59e0b', min: 0, max: 50 },
            { sub: 'i', val: ki, set: setKi, color: '#10b981', min: 0, max: 50 },
            { sub: 'd', val: kd, set: setKd, color: '#3b82f6', min: 0, max: 50 },
          ].map(g => (
            <div key={g.sub} className="flex items-center gap-3">
              <span className="font-bold shrink-0" style={{ fontSize: '1.5rem', color: g.color }}>k<sub>{g.sub}</sub></span>
              <input
                type="range"
                min={g.min} max={g.max} step="0.001"
                value={g.val}
                onChange={e => g.set(parseFloat(e.target.value))}
                className="flex-1"
                style={{ accentColor: g.color }}
              />
              <input
                type="number"
                value={g.val.toFixed(4)}
                onChange={e => g.set(parseFloat(e.target.value) || 0)}
                className="input-field w-[7.5rem] text-center font-bold"
                style={{ fontSize: '1.125rem' }}
                step="0.001"
                min={g.min}
                max={g.max}
              />
            </div>
          ))}
        </div>
        {/* Both forms */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-dark-bg rounded-lg p-3 border border-dark-border">
            <p className="text-gray-500 font-medium mb-2" style={{ fontSize: '1.25rem' }}>Parallel Form</p>
            <div className="font-mono font-bold space-y-1" style={{ fontSize: '1.225rem' }}>
              <p><span className="text-yellow-400">k<sub>p</sub></span> = {kp.toFixed(4)}</p>
              <p><span className="text-green-400">k<sub>i</sub></span> = {ki.toFixed(4)}</p>
              <p><span className="text-blue-400">k<sub>d</sub></span> = {kd.toFixed(4)}</p>
            </div>
          </div>
          <div className="bg-dark-bg rounded-lg p-3 border border-dark-border">
            <p className="text-gray-500 font-medium mb-2" style={{ fontSize: '1.25rem' }}>Standard Form</p>
            <div className="font-mono font-bold space-y-1" style={{ fontSize: '1.225rem' }}>
              <p><span className="text-yellow-400">K<sub>p</sub></span> = {Kp.toFixed(4)}</p>
              <p><span className="text-green-400">T<sub>i</sub></span> = {isFinite(Ti) ? Ti.toFixed(4) : '∞'} s</p>
              <p><span className="text-blue-400">T<sub>d</sub></span> = {Td.toFixed(4)} s</p>
            </div>
          </div>
        </div>
        {recomputing && <p className="text-gray-500 text-xs mt-2 animate-pulse">Recomputing...</p>}
      </div>

      {/* Step response + Control signal */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-3">Step Response y(t)</h2>
          {simData ? (
            <PlotlyChart
              id="step-response"
              data={[
                { x: simData.t, y: simData.y, type: 'scatter', mode: 'lines', name: 'y(t)', line: { color: '#3b82f6', width: 3.5 } },
                { x: [simData.t[0], simData.t[simData.t.length - 1]], y: [1, 1], type: 'scatter', mode: 'lines', name: 'Setpoint r(t)', line: { color: '#ef4444', width: 2 } },
              ]}
              layout={{
                xaxis: { title: { text: 'Time (s)', font: { size: 17, weight: 'bold' } }, tickfont: { size: 16, weight: 'bold' }, showline: true, mirror: true, linecolor: '#9ca3af', linewidth: 1.5 },
                yaxis: { title: { text: 'Output y(t)', font: { size: 17, weight: 'bold' } }, tickfont: { size: 16, weight: 'bold' }, autorange: true, showline: true, mirror: true, linecolor: '#9ca3af', linewidth: 1.5 },
                legend: { x: 0.99, y: 0.01, xanchor: 'right', yanchor: 'bottom', font: { size: 18, weight: 'bold' } },
                margin: { l: 70, r: 40, t: 10, b: 55 },
                modebar: { orientation: 'v', bgcolor: 'rgba(255,255,255,0.8)' },
                height: 416,
              }}
            />
          ) : <div className="h-64 flex items-center justify-center text-gray-600">Computing...</div>}
        </div>

        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-3">Control Signal u(t)</h2>
          {simData ? (
            <PlotlyChart
              id="control-signal"
              data={[
                { x: simData.t, y: simData.u, type: 'scatter', mode: 'lines', name: 'u(t)', line: { color: '#8b5cf6', width: 3.5 } },
                criterion.useControlConstraint && { x: [simData.t[0], simData.t[simData.t.length - 1]], y: [criterion.uMax, criterion.uMax], type: 'scatter', mode: 'lines', name: 'u<sub>max</sub>', line: { color: '#ef4444', width: 2, dash: 'dash' } },
                criterion.useControlConstraint && { x: [simData.t[0], simData.t[simData.t.length - 1]], y: [criterion.uMin, criterion.uMin], type: 'scatter', mode: 'lines', name: 'u<sub>min</sub>', line: { color: '#f59e0b', width: 2, dash: 'dash' } },
              ].filter(Boolean)}
              layout={{
                xaxis: { title: { text: 'Time (s)', font: { size: 17, weight: 'bold' } }, tickfont: { size: 16, weight: 'bold' }, showline: true, mirror: true, linecolor: '#9ca3af', linewidth: 1.5 },
                yaxis: { title: { text: 'u(t)', font: { size: 17, weight: 'bold' } }, tickfont: { size: 16, weight: 'bold' }, autorange: true, showline: true, mirror: true, linecolor: '#9ca3af', linewidth: 1.5 },
                legend: { x: 0.99, y: 0.01, xanchor: 'right', yanchor: 'bottom', font: { size: 18, weight: 'bold' } },
                margin: { l: 70, r: 40, t: 10, b: 55 },
                modebar: { orientation: 'v', bgcolor: 'rgba(255,255,255,0.8)' },
                height: 416,
              }}
            />
          ) : <div className="h-64 flex items-center justify-center text-gray-600">Computing...</div>}
        </div>
      </div>

      {/* Metrics table */}
      <div className="card">
        <h2 className="font-semibold text-gray-900 mb-4">Performance Metrics</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {metricRows.map(m => (
            <div key={m.label} className="metric-card">
              <div className="text-lg font-bold text-gray-900 font-mono">{m.val}</div>
              <div className="text-gray-700 font-bold mt-1" style={{ fontSize: '1.125rem' }}>{m.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Bode plot */}
      <div className="card">
        <h2 className="font-semibold text-gray-900 mb-1">Frequency Domain — Bode Plot</h2>
        <p className="text-gray-500 text-xs mb-3">Closed-loop H(jω) = C(jω)·G(jω) / (1 + C(jω)·G(jω))</p>
        {bode ? (
          <>
            <PlotlyChart
              id="bode"
              data={[
                { x: bode.freqs, y: bode.magCL, type: 'scatter', mode: 'lines', name: 'Magnitude (dB)', line: { color: '#3b82f6', width: 3.5 }, xaxis: 'x', yaxis: 'y' },
                { x: bode.freqs, y: bode.phaseCL, type: 'scatter', mode: 'lines', name: 'Phase (°)', line: { color: '#f59e0b', width: 3.5 }, xaxis: 'x', yaxis: 'y2' },
                { x: [bode.freqs[0], bode.freqs[bode.freqs.length - 1]], y: [0, 0], type: 'scatter', mode: 'lines', name: '0 dB', line: { color: '#4b5563', width: 2, dash: 'dot' }, xaxis: 'x', yaxis: 'y', showlegend: false },
              ]}
              layout={{
                xaxis: { type: 'log', dtick: 1, title: { text: 'Frequency (rad/s)', font: { size: 17, weight: 'bold' } }, tickfont: { size: 16, weight: 'bold' }, showline: true, mirror: true, linecolor: '#9ca3af', linewidth: 1.5 },
                yaxis: { title: { text: 'Magnitude (dB)', font: { size: 17, weight: 'bold' } }, tickfont: { size: 16, weight: 'bold' }, showline: true, linecolor: '#9ca3af', linewidth: 1.5, side: 'left' },
                yaxis2: { title: { text: 'Phase (°)', font: { size: 17, weight: 'bold' } }, tickfont: { size: 16, weight: 'bold' }, side: 'right', overlaying: 'y' },
                legend: { x: 0.99, y: 0.99, xanchor: 'right', yanchor: 'top', font: { size: 18, weight: 'bold' } },
                margin: { l: 70, r: 70, t: 10, b: 55 },
                modebar: { orientation: 'v', bgcolor: 'rgba(255,255,255,0.8)' },
                height: 380,
              }}
            />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
              {[
                { label: 'Gain Margin', val: isFinite(bode.gainMargin) ? `${bode.gainMargin.toFixed(2)} dB` : '∞', good: bode.gainMargin > 6 },
                { label: 'Phase Margin', val: isFinite(bode.phaseMargin) ? `${bode.phaseMargin.toFixed(2)}°` : '∞', good: bode.phaseMargin > 30 },
                { label: 'Crossover Freq', val: bode.phaseMarginFreq ? `${bode.phaseMarginFreq.toFixed(3)} rad/s` : 'N/A', good: true },
                { label: 'Phase Crossover', val: bode.gainMarginFreq ? `${bode.gainMarginFreq.toFixed(3)} rad/s` : 'N/A', good: true },
              ].map(s => (
                <div key={s.label} className={`metric-card border ${s.good ? 'border-accent-green/30' : 'border-red-500/30'}`}>
                  <div className={`font-bold font-mono ${s.good ? 'text-accent-green' : 'text-red-400'}`} style={{ fontSize: '1.5rem' }}>{s.val}</div>
                  <div className="text-gray-500 font-medium mt-1" style={{ fontSize: '1.125rem' }}>{s.label}</div>
                </div>
              ))}
            </div>
          </>
        ) : <div className="h-48 flex items-center justify-center text-gray-600">Computing Bode plot...</div>}
      </div>

      {/* Navigation */}
      <div className="flex justify-between pt-2 pb-4">
        <button onClick={() => navigate('/optimizer')} className="btn-secondary">← Back to Optimizer</button>
        <button onClick={() => navigate('/analysis')} className="btn-primary px-8">Advanced Analysis →</button>
      </div>
    </div>
  )
}
