import React, { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import useStore from '../store/useStore'
import PlotlyChart from '../components/PlotlyChart'
import AppTabs from '../components/AppTabs'
import { computeSimParams } from '../math/simulation'

const TABS = ['Disturbance Response', 'Sensitivity Analysis', 'Robustness Check']

// ── shared helpers ────────────────────────────────────────────────────────────

function Card({ children, className = '' }) {
  return <div className={`card rounded-xl ${className}`}>{children}</div>
}

function Label({ children }) {
  return <p className="text-lg font-semibold text-gray-700 mb-2">{children}</p>
}

function SectionTitle({ children }) {
  return <h3 className="font-semibold text-gray-900 text-lg mb-3">{children}</h3>
}

function RunBtn({ onClick, running, disabled, children }) {
  return (
    <button
      onClick={onClick}
      disabled={running || !!disabled}
      className="btn-primary w-full flex items-center justify-center gap-2"
    >
      {running ? (
        <>
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          Computing…
        </>
      ) : children}
    </button>
  )
}

function MetricRow({ label, value, unit = '' }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-dark-border last:border-0">
      <span className="text-gray-600 text-base">{label}</span>
      <span className="font-semibold text-gray-900 text-base tabular-nums">
        {value === null || value === undefined ? '—' : `${value}${unit ? ' ' + unit : ''}`}
      </span>
    </div>
  )
}

function fmt(v, decimals = 4) {
  if (v === null || v === undefined || !isFinite(v)) return '—'
  return Number(v).toFixed(decimals)
}

// ── Tab 1: Disturbance Response ───────────────────────────────────────────────

function DisturbanceTab({ plant, criterion, results }) {
  const [distType, setDistType] = useState('step')
  const [distPoint, setDistPoint] = useState('output')
  const [amplitude, setAmplitude] = useState(0.2)
  const [tOnset, setTOnset] = useState(5)
  const [sineFreq, setSineFreq] = useState(1)
  const [running, setRunning] = useState(false)
  const [simResult, setSimResult] = useState(null)
  const workerRef = useRef(null)

  const handleRun = useCallback(() => {
    if (running) return
    if (workerRef.current) { workerRef.current.terminate(); workerRef.current = null }
    setRunning(true)
    setSimResult(null)

    const { dt, T } = computeSimParams(plant.den, plant.delay)
    const uMin = criterion.useControlConstraint ? criterion.uMin : -Infinity
    const uMax = criterion.useControlConstraint ? criterion.uMax : Infinity

    const w = new Worker(new URL('../workers/disturbance.worker.js', import.meta.url), { type: 'module' })
    workerRef.current = w
    w.onmessage = ({ data }) => {
      if (data.type === 'result') { setSimResult(data.payload); setRunning(false) }
      else if (data.type === 'error') { setRunning(false) }
    }
    w.postMessage({
      type: 'run',
      payload: {
        num: plant.num, den: plant.den, delay: plant.delay,
        kp: results.kpAdj ?? results.kp,
        ki: results.kiAdj ?? results.ki,
        kd: results.kdAdj ?? results.kd,
        dt, T, uMin, uMax,
        disturbance: { type: distType, point: distPoint, amplitude, tOnset, sineFreq }
      }
    })
  }, [plant, criterion, results, distType, distPoint, amplitude, tOnset, sineFreq, running])

  useEffect(() => () => { workerRef.current?.terminate() }, [])

  const { t: simT, y: simY, u: simU, metrics } = simResult ?? {}
  const tEnd = simT ? simT[simT.length - 1] : 30

  const yData = simT ? [
    { x: simT, y: simY, name: 'y(t)', line: { color: '#3b82f6', width: 2.5 }, type: 'scatter', mode: 'lines' },
    { x: [0, tEnd], y: [1, 1], name: 'r(t)', line: { color: '#ef4444', width: 1.5, dash: 'dash' }, type: 'scatter', mode: 'lines' },
  ] : []

  const uData = simT ? [
    { x: simT, y: simU, name: 'u(t)', line: { color: '#8b5cf6', width: 2.5 }, type: 'scatter', mode: 'lines' },
  ] : []

  const onsetShape = {
    type: 'line', x0: tOnset, x1: tOnset, y0: 0, y1: 1, yref: 'paper',
    line: { color: '#6b7280', dash: 'dot', width: 1.5 }
  }
  const onsetAnnotation = {
    x: tOnset, y: 0.96, yref: 'paper', xanchor: 'left', showarrow: false,
    text: 'Disturbance onset', font: { color: '#6b7280', size: 10 }
  }

  return (
    <div className="flex gap-6">
      {/* Left panel */}
      <div className="w-72 xl:w-80 shrink-0 space-y-4">
        <Card>
          <SectionTitle>Disturbance Settings</SectionTitle>
          <div className="space-y-4">
            <div>
              <Label>Disturbance Type</Label>
              <select value={distType} onChange={e => setDistType(e.target.value)} className="input-field">
                <option value="step">Step</option>
                <option value="impulse">Impulse</option>
                <option value="sine">Sine</option>
              </select>
            </div>
            <div>
              <Label>Application Point</Label>
              <select value={distPoint} onChange={e => setDistPoint(e.target.value)} className="input-field">
                <option value="output">Output (measurement noise)</option>
                <option value="input">Input (actuator noise)</option>
              </select>
            </div>
            <div>
              <Label>Amplitude</Label>
              <div className="flex gap-2 items-center">
                <input type="range" min={-2} max={2} step={0.05} value={amplitude}
                  onChange={e => setAmplitude(parseFloat(e.target.value))} className="flex-1"/>
                <input type="number" value={amplitude} step={0.05}
                  onChange={e => setAmplitude(parseFloat(e.target.value) || 0)}
                  className="input-field w-20 text-center text-sm"/>
              </div>
            </div>
            <div>
              <Label>Onset Time (s)</Label>
              <div className="flex gap-2 items-center">
                <input type="range" min={0.5} max={30} step={0.5} value={tOnset}
                  onChange={e => setTOnset(parseFloat(e.target.value))} className="flex-1"/>
                <input type="number" value={tOnset} step={0.5} min={0.5}
                  onChange={e => setTOnset(parseFloat(e.target.value) || 5)}
                  className="input-field w-20 text-center text-sm"/>
              </div>
            </div>
            {distType === 'sine' && (
              <div>
                <Label>Sine Frequency (Hz)</Label>
                <div className="flex gap-2 items-center">
                  <input type="range" min={0.1} max={10} step={0.1} value={sineFreq}
                    onChange={e => setSineFreq(parseFloat(e.target.value))} className="flex-1"/>
                  <input type="number" value={sineFreq} step={0.1} min={0.01}
                    onChange={e => setSineFreq(parseFloat(e.target.value) || 1)}
                    className="input-field w-20 text-center text-sm"/>
                </div>
              </div>
            )}
          </div>
        </Card>
        <RunBtn onClick={handleRun} running={running}>Run Simulation</RunBtn>

        {metrics && (
          <Card>
            <SectionTitle>Disturbance Rejection Metrics</SectionTitle>
            <MetricRow label="Max Deviation" value={fmt(metrics.maxDeviation, 4)} unit=""/>
            <MetricRow label="Recovery Time" value={fmt(metrics.recoveryTime, 4)} unit="s"/>
            <MetricRow label="Steady-State Error" value={fmt(metrics.steadyStateError, 6)} unit=""/>
          </Card>
        )}
      </div>

      {/* Right panel */}
      <div className="flex-1 min-w-0 space-y-4">
        {!simResult && !running && (
          <div className="flex items-center justify-center h-64 bg-dark-card border border-dark-border rounded-xl">
            <p className="text-gray-500">Configure disturbance and click Run Simulation</p>
          </div>
        )}
        {running && (
          <div className="flex items-center justify-center h-64 bg-dark-card border border-dark-border rounded-xl">
            <div className="text-center">
              <svg className="animate-spin h-8 w-8 text-accent-blue mx-auto mb-2" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              <p className="text-gray-500">Simulating…</p>
            </div>
          </div>
        )}
        {simResult && (
          <>
            <Card>
              <h4 className="font-semibold text-gray-800 mb-2">Output Response y(t)</h4>
              <PlotlyChart
                id="dist-y"
                data={yData}
                layout={{
                  xaxis: { title: { text: 'Time (s)', font: { size: 17, weight: 'bold' } }, tickfont: { size: 16, weight: 'bold' } },
                  yaxis: { title: { text: 'Output', font: { size: 17, weight: 'bold' } }, tickfont: { size: 16, weight: 'bold' } },
                  shapes: [onsetShape],
                  annotations: [onsetAnnotation],
                  legend: { orientation: 'h', y: 1.12, font: { size: 18, weight: 'bold' } },
                }}
                style={{ minHeight: 280 }}
              />
            </Card>
            <Card>
              <h4 className="font-semibold text-gray-800 mb-2">Control Signal u(t)</h4>
              <PlotlyChart
                id="dist-u"
                data={uData}
                layout={{
                  xaxis: { title: { text: 'Time (s)', font: { size: 17, weight: 'bold' } }, tickfont: { size: 16, weight: 'bold' } },
                  yaxis: { title: { text: 'Control signal', font: { size: 17, weight: 'bold' } }, tickfont: { size: 16, weight: 'bold' } },
                  shapes: [onsetShape],
                  annotations: [onsetAnnotation],
                }}
                style={{ minHeight: 240 }}
              />
            </Card>
          </>
        )}
      </div>
    </div>
  )
}

// ── Tab 2: Sensitivity Analysis ───────────────────────────────────────────────

const METRIC_OPTIONS = [
  { key: 'overshoot',    label: 'Overshoot' },
  { key: 'riseTime',     label: 'Rise Time' },
  { key: 'settlingTime', label: 'Settling Time' },
  { key: 'ITAE',         label: 'ITAE' },
  { key: 'ISE',          label: 'ISE' },
  { key: 'phaseMargin',  label: 'Phase Margin' },
]

const LINE_COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4']

function SensitivityTab({ plant, criterion, results }) {
  const activeOrder = plant.order || 2
  const allParamIndices = Array.from({ length: activeOrder + 1 }, (_, i) => i)

  const [checkedParams, setCheckedParams] = useState(
    new Set(allParamIndices.slice(0, Math.min(3, allParamIndices.length)))
  )
  const [variation, setVariation] = useState(30)
  const [nPoints, setNPoints] = useState(9)
  const [selectedMetrics, setSelectedMetrics] = useState(new Set(['overshoot', 'settlingTime', 'phaseMargin']))
  const [running, setRunning] = useState(false)
  const [sensResult, setSensResult] = useState(null)
  const [chartParam, setChartParam] = useState(null)
  const workerRef = useRef(null)

  const toggleParam = (idx) => {
    setCheckedParams(prev => {
      const s = new Set(prev)
      s.has(idx) ? s.delete(idx) : s.add(idx)
      return s
    })
  }
  const toggleMetric = (key) => {
    setSelectedMetrics(prev => {
      const s = new Set(prev)
      s.has(key) ? s.delete(key) : s.add(key)
      return s
    })
  }

  const handleRun = useCallback(() => {
    if (running || checkedParams.size === 0) return
    if (workerRef.current) { workerRef.current.terminate(); workerRef.current = null }
    setRunning(true); setSensResult(null)

    const { dt, T } = computeSimParams(plant.den, plant.delay)
    const uMin = criterion.useControlConstraint ? criterion.uMin : -Infinity
    const uMax = criterion.useControlConstraint ? criterion.uMax : Infinity

    const anyEnabled = Object.values(criterion.enabled).some(Boolean)
    const crit = anyEnabled ? criterion : { ...criterion, enabled: { ...criterion.enabled, w3: true }, weights: { ...criterion.weights, w3: 1 } }

    const w = new Worker(new URL('../workers/sensitivity.worker.js', import.meta.url), { type: 'module' })
    workerRef.current = w
    w.onmessage = ({ data }) => {
      if (data.type === 'result') {
        const res = data.payload
        const mostInfluential = res.params.reduce((best, p) => p.influence > (best?.influence ?? -1) ? p : best, null)
        setChartParam(mostInfluential?.idx ?? null)
        setSensResult(res)
        setRunning(false)
      } else if (data.type === 'error') { setRunning(false) }
    }
    w.postMessage({
      type: 'run',
      payload: {
        num: plant.num, den: plant.den, delay: plant.delay,
        kp: results.kpAdj ?? results.kp,
        ki: results.kiAdj ?? results.ki,
        kd: results.kdAdj ?? results.kd,
        dt, T, uMin, uMax,
        paramIndices: Array.from(checkedParams).sort(),
        variation, nPoints,
        criterion: crit,
        includeMetrics: Array.from(selectedMetrics),
      }
    })
  }, [plant, criterion, results, checkedParams, variation, nPoints, selectedMetrics, running])

  useEffect(() => () => { workerRef.current?.terminate() }, [])

  // Build tornado chart data
  const tornadoData = sensResult ? (() => {
    const sorted = [...sensResult.params].sort((a, b) => b.influence - a.influence)
    const maxInfl = Math.max(...sorted.map(p => p.influence), 0.01)
    const posBars = sorted.map(p => p.influence > 0 ? p.influence : 0)
    const negBars = sorted.map(p => {
      // find max negative delta
      const maxNeg = Math.max(...(p.fofDeltas?.map(v => v < 0 ? Math.abs(v) : 0) ?? [0]))
      return maxNeg
    })
    return [
      {
        type: 'bar', orientation: 'h', name: 'Positive effect',
        y: sorted.map(p => p.name), x: posBars,
        marker: { color: '#3b82f6' },
      },
      {
        type: 'bar', orientation: 'h', name: 'Negative effect',
        y: sorted.map(p => p.name), x: negBars.map(v => -v),
        marker: { color: '#ef4444' },
      }
    ]
  })() : []

  // Metrics vs variation chart for selected parameter
  const metricsChartData = (sensResult && chartParam !== null) ? (() => {
    const paramData = sensResult.params.find(p => p.idx === chartParam)
    if (!paramData) return []
    return Array.from(selectedMetrics).map((mKey, mi) => {
      const mData = paramData.metricsData[mKey] ?? []
      const label = METRIC_OPTIONS.find(o => o.key === mKey)?.label ?? mKey
      return {
        type: 'scatter', mode: 'lines+markers', name: label,
        x: sensResult.vars,
        y: mData,
        line: { color: LINE_COLORS[mi % LINE_COLORS.length], width: 2 },
        marker: { color: LINE_COLORS[mi % LINE_COLORS.length], size: 5 }
      }
    })
  })() : []

  const displayedParam = sensResult?.params.find(p => p.idx === chartParam)

  return (
    <div className="flex gap-6">
      {/* Left panel */}
      <div className="w-72 xl:w-80 shrink-0 space-y-4">
        <Card>
          <SectionTitle>Parameters to Vary</SectionTitle>
          <p className="text-xs text-gray-500 mb-2">Active denominator coefficients</p>
          <div className="space-y-1.5">
            {allParamIndices.map(idx => (
              <label key={idx} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={checkedParams.has(idx)}
                  onChange={() => toggleParam(idx)}
                  className="rounded border-dark-border text-accent-blue"/>
                <span className="text-base text-gray-700">
                  A<sub>{idx}</sub> = {(plant.den[idx] ?? 0).toFixed(4)}
                </span>
              </label>
            ))}
          </div>
        </Card>

        <Card>
          <SectionTitle>Analysis Settings</SectionTitle>
          <div className="space-y-4">
            <div>
              <Label>Variation Range: ±{variation}%</Label>
              <input type="range" min={5} max={50} step={5} value={variation}
                onChange={e => setVariation(parseInt(e.target.value))} className="w-full"/>
            </div>
            <div>
              <Label>Points per Parameter</Label>
              <select value={nPoints} onChange={e => setNPoints(parseInt(e.target.value))} className="input-field">
                <option value={5}>5</option>
                <option value={9}>9</option>
                <option value={13}>13</option>
                <option value={17}>17</option>
              </select>
            </div>
          </div>
        </Card>

        <Card>
          <SectionTitle>Metrics to Track</SectionTitle>
          <div className="space-y-1.5">
            {METRIC_OPTIONS.map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={selectedMetrics.has(key)}
                  onChange={() => toggleMetric(key)}
                  className="rounded border-dark-border text-accent-blue"/>
                <span className="text-base text-gray-700">{label}</span>
              </label>
            ))}
          </div>
        </Card>

        <RunBtn onClick={handleRun} running={running} disabled={checkedParams.size === 0}>
          Run Sensitivity Analysis
        </RunBtn>
      </div>

      {/* Right panel */}
      <div className="flex-1 min-w-0 space-y-4">
        {!sensResult && !running && (
          <div className="flex items-center justify-center h-64 bg-dark-card border border-dark-border rounded-xl">
            <p className="text-gray-500">Select parameters and click Run Sensitivity Analysis</p>
          </div>
        )}
        {running && (
          <div className="flex items-center justify-center h-64 bg-dark-card border border-dark-border rounded-xl">
            <div className="text-center">
              <svg className="animate-spin h-8 w-8 text-accent-blue mx-auto mb-2" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              <p className="text-gray-500">Analyzing parameter sensitivity…</p>
            </div>
          </div>
        )}
        {sensResult && (
          <>
            <Card>
              <h4 className="font-semibold text-gray-800 mb-1">Tornado Chart — Parameter Influence on f<sub>OF</sub></h4>
              <p className="text-xs text-gray-500 mb-2">% change in objective function (bars to right = increase, left = decrease)</p>
              <PlotlyChart
                id="tornado"
                data={tornadoData}
                layout={{
                  barmode: 'overlay',
                  xaxis: { title: { text: '% change in f_OF', font: { size: 17, weight: 'bold' } }, tickfont: { size: 16, weight: 'bold' } },
                  yaxis: { title: { text: '' }, automargin: true, tickfont: { size: 16, weight: 'bold' } },
                  legend: { orientation: 'h', y: 1.1, font: { size: 18, weight: 'bold' } },
                  margin: { l: 70, r: 20, t: 30, b: 50 },
                }}
                style={{ minHeight: 260 }}
              />
            </Card>

            {displayedParam && (
              <Card>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-gray-800">
                    Metrics vs Variation — Parameter{' '}
                    <select value={chartParam}
                      onChange={e => setChartParam(parseInt(e.target.value))}
                      className="ml-1 text-sm border border-dark-border rounded px-2 py-0.5">
                      {sensResult.params.map(p => (
                        <option key={p.idx} value={p.idx}>A{p.idx}</option>
                      ))}
                    </select>
                  </h4>
                </div>
                <p className="text-xs text-gray-500 mb-2">% change relative to nominal value</p>
                <PlotlyChart
                  id="sens-metrics"
                  data={metricsChartData}
                  layout={{
                    xaxis: { title: { text: 'Parameter variation (%)', font: { size: 17, weight: 'bold' } }, tickfont: { size: 16, weight: 'bold' } },
                    yaxis: { title: { text: '% change from nominal', font: { size: 17, weight: 'bold' } }, tickfont: { size: 16, weight: 'bold' } },
                    legend: { orientation: 'h', y: 1.12, font: { size: 18, weight: 'bold' } },
                    shapes: [{ type: 'line', x0: 0, x1: 0, y0: 0, y1: 1, yref: 'paper', line: { color: '#6b7280', dash: 'dot', width: 1 } }],
                  }}
                  style={{ minHeight: 260 }}
                />
              </Card>
            )}

            <Card>
              <SectionTitle>Sensitivity Summary</SectionTitle>
              <div className="overflow-x-auto">
                <table className="w-full text-base">
                  <thead>
                    <tr className="border-b border-dark-border">
                      <th className="text-left py-2 pr-4 font-semibold text-gray-700">Parameter</th>
                      <th className="text-right py-2 pr-4 font-semibold text-gray-700">Nominal Value</th>
                      <th className="text-right py-2 pr-4 font-semibold text-gray-700">Influence on f<sub>OF</sub> (%)</th>
                      <th className="text-right py-2 font-semibold text-gray-700">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...sensResult.params].sort((a, b) => b.influence - a.influence).map(p => (
                      <tr key={p.idx} className="border-b border-dark-border last:border-0">
                        <td className="py-2 pr-4 font-medium">A<sub>{p.idx}</sub></td>
                        <td className="py-2 pr-4 text-right tabular-nums">{fmt(p.nomVal, 4)}</td>
                        <td className="py-2 pr-4 text-right tabular-nums font-semibold"
                            style={{ color: p.influence > 50 ? '#ef4444' : p.influence > 20 ? '#f59e0b' : '#10b981' }}>
                          {fmt(p.influence, 2)}%
                        </td>
                        <td className="py-2 text-right">
                          {p.influence > 50
                            ? <span className="text-red-500 font-semibold">High</span>
                            : p.influence > 20
                            ? <span className="text-amber-500 font-semibold">Medium</span>
                            : <span className="text-green-600 font-semibold">Low</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}

// ── Tab 3: Robustness Check ───────────────────────────────────────────────────

function RobustnessTab({ plant, criterion, results }) {
  const [variation, setVariation] = useState(20)
  const [nSamples, setNSamples] = useState(50)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [robResult, setRobResult] = useState(null)
  const workerRef = useRef(null)

  const handleRun = useCallback(() => {
    if (running) return
    if (workerRef.current) { workerRef.current.terminate(); workerRef.current = null }
    setRunning(true); setRobResult(null); setProgress(0)

    const { dt, T } = computeSimParams(plant.den, plant.delay)
    const uMin = criterion.useControlConstraint ? criterion.uMin : -Infinity
    const uMax = criterion.useControlConstraint ? criterion.uMax : Infinity

    const w = new Worker(new URL('../workers/robustness.worker.js', import.meta.url), { type: 'module' })
    workerRef.current = w
    w.onmessage = ({ data }) => {
      if (data.type === 'progress') { setProgress(data.payload.percent) }
      else if (data.type === 'result') { setRobResult(data.payload); setRunning(false) }
      else if (data.type === 'error') { setRunning(false) }
    }
    w.postMessage({
      type: 'run',
      payload: {
        num: plant.num, den: plant.den, delay: plant.delay,
        kp: results.kpAdj ?? results.kp,
        ki: results.kiAdj ?? results.ki,
        kd: results.kdAdj ?? results.kd,
        dt, T, uMin, uMax,
        nSamples, variation
      }
    })
  }, [plant, criterion, results, nSamples, variation, running])

  useEffect(() => () => { workerRef.current?.terminate() }, [])

  const { samples, summary } = robResult ?? {}

  // PM histogram
  const pmHistData = samples ? (() => {
    const pmVals = samples.map(s => s.pm).filter(v => v > -900 && v < 900)
    const binSize = 5
    const minB = Math.floor(Math.min(...pmVals) / binSize) * binSize
    const maxB = Math.ceil(Math.max(...pmVals) / binSize) * binSize
    const bins = []
    for (let b = minB; b < maxB; b += binSize) {
      const count = pmVals.filter(v => v >= b && v < b + binSize).length
      bins.push({ mid: b + binSize / 2, count })
    }
    return [{
      type: 'bar',
      x: bins.map(b => b.mid),
      y: bins.map(b => b.count),
      marker: {
        color: bins.map(b =>
          b.mid > 45 ? '#22c55e' : b.mid > 30 ? '#f59e0b' : b.mid > 0 ? '#ef4444' : '#7f1d1d'
        )
      },
      name: 'Phase Margin',
    }]
  })() : []

  // Stability map scatter
  const scatterData = samples ? [{
    type: 'scatter', mode: 'markers',
    x: samples.map(s => s.avgVar),
    y: samples.map(s => s.pm > 900 ? null : s.pm < -900 ? null : s.pm),
    marker: {
      color: samples.map(s =>
        s.stable ? (s.pm > 45 ? '#22c55e' : '#f59e0b') : '#ef4444'
      ),
      size: 8, opacity: 0.85,
    },
    name: 'Samples',
  }] : []

  const stablePct = summary?.stablePercent ?? 0
  const statusColor = stablePct >= 90 ? '#22c55e' : stablePct >= 60 ? '#f59e0b' : '#ef4444'

  return (
    <div className="flex gap-6">
      {/* Left panel */}
      <div className="w-72 xl:w-80 shrink-0 space-y-4">
        <Card>
          <SectionTitle>Robustness Settings</SectionTitle>
          <div className="space-y-4">
            <div>
              <Label>Parameter Variation: ±{variation}%</Label>
              <input type="range" min={5} max={50} step={5} value={variation}
                onChange={e => setVariation(parseInt(e.target.value))} className="w-full"/>
              <p className="text-xs text-gray-500 mt-1">All plant coefficients varied simultaneously</p>
            </div>
            <div>
              <Label>Sample Count</Label>
              <div className="flex gap-2 items-center">
                <input type="range" min={20} max={200} step={10} value={nSamples}
                  onChange={e => setNSamples(parseInt(e.target.value))} className="flex-1"/>
                <input type="number" value={nSamples} min={20} max={200} step={10}
                  onChange={e => setNSamples(Math.max(20, Math.min(200, parseInt(e.target.value) || 50)))}
                  className="input-field w-20 text-center text-sm"/>
              </div>
            </div>
          </div>
        </Card>

        <RunBtn onClick={handleRun} running={running}>
          {running ? `Computing… ${progress}%` : 'Run Robustness Check'}
        </RunBtn>

        {running && (
          <div className="w-full bg-dark-border rounded-full h-2 mt-1">
            <div className="bg-accent-blue h-2 rounded-full transition-all duration-200"
              style={{ width: `${progress}%` }}/>
          </div>
        )}

        {summary && (
          <Card>
            <SectionTitle>Summary</SectionTitle>
            <div className="space-y-1">
              <MetricRow label="Mean Phase Margin" value={summary.meanPM} unit="deg"/>
              <MetricRow label="Min Phase Margin" value={summary.minPM} unit="deg"/>
              <MetricRow label="Max Phase Margin" value={summary.maxPM} unit="deg"/>
              <MetricRow label="Min Overshoot" value={summary.minOvershoot} unit="%"/>
              <MetricRow label="Max Overshoot" value={summary.maxOvershoot} unit="%"/>
              <MetricRow label="Critical Variation" value={`±${summary.criticalVariation}%`}/>
            </div>
          </Card>
        )}
      </div>

      {/* Right panel */}
      <div className="flex-1 min-w-0 space-y-4">
        {!robResult && !running && (
          <div className="flex items-center justify-center h-64 bg-dark-card border border-dark-border rounded-xl">
            <p className="text-gray-500">Configure settings and click Run Robustness Check</p>
          </div>
        )}
        {running && progress === 0 && (
          <div className="flex items-center justify-center h-64 bg-dark-card border border-dark-border rounded-xl">
            <p className="text-gray-500">Starting Monte Carlo analysis…</p>
          </div>
        )}
        {robResult && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Stable Samples', value: `${summary.stableCount}/${summary.totalCount}`, sub: `${summary.stablePercent}%`, color: statusColor },
                { label: 'Mean PM', value: `${summary.meanPM}°`, sub: `min: ${summary.minPM}°`, color: '#3b82f6' },
                { label: 'Max Overshoot', value: `${summary.maxOvershoot}%`, sub: `min: ${summary.minOvershoot}%`, color: '#8b5cf6' },
                { label: 'Critical Variation', value: String(summary.criticalVariation).startsWith('>') ? `${summary.criticalVariation}%` : `±${summary.criticalVariation}%`, sub: 'first instability', color: '#f59e0b' },
              ].map((card, i) => (
                <div key={i} className="bg-dark-card border border-dark-border rounded-xl p-4 text-center">
                  <p className="text-xs text-gray-500 mb-1">{card.label}</p>
                  <p className="text-2xl font-bold" style={{ color: card.color }}>{card.value}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{card.sub}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <Card>
                <h4 className="font-semibold text-gray-800 mb-2">Phase Margin Distribution</h4>
                <p className="text-xs text-gray-500 mb-2">
                  <span style={{ color: '#22c55e' }}>■</span> PM &gt; 45°&nbsp;
                  <span style={{ color: '#f59e0b' }}>■</span> 30–45°&nbsp;
                  <span style={{ color: '#ef4444' }}>■</span> 0–30°&nbsp;
                  <span style={{ color: '#7f1d1d' }}>■</span> PM &lt; 0° (unstable)
                </p>
                <PlotlyChart
                  id="rob-hist"
                  data={pmHistData}
                  layout={{
                    xaxis: { title: { text: 'Phase Margin (deg)', font: { size: 17, weight: 'bold' } }, tickfont: { size: 16, weight: 'bold' } },
                    yaxis: { title: { text: 'Count', font: { size: 17, weight: 'bold' } }, tickfont: { size: 16, weight: 'bold' } },
                    showlegend: false,
                  }}
                  style={{ minHeight: 240 }}
                />
              </Card>

              <Card>
                <h4 className="font-semibold text-gray-800 mb-2">Stability Map</h4>
                <p className="text-xs text-gray-500 mb-2">X = average parameter variation, Y = phase margin</p>
                <PlotlyChart
                  id="rob-scatter"
                  data={scatterData}
                  layout={{
                    xaxis: { title: { text: 'Avg variation (%)', font: { size: 17, weight: 'bold' } }, tickfont: { size: 16, weight: 'bold' } },
                    yaxis: { title: { text: 'Phase Margin (deg)', font: { size: 17, weight: 'bold' } }, tickfont: { size: 16, weight: 'bold' } },
                    showlegend: false,
                    shapes: [
                      { type: 'line', x0: 0, x1: 1, xref: 'paper', y0: 45, y1: 45, line: { color: '#22c55e', dash: 'dash', width: 1.5 } },
                      { type: 'line', x0: 0, x1: 1, xref: 'paper', y0: 30, y1: 30, line: { color: '#f59e0b', dash: 'dot', width: 1.5 } },
                      { type: 'line', x0: 0, x1: 1, xref: 'paper', y0: 0, y1: 0, line: { color: '#ef4444', dash: 'dash', width: 1.5 } },
                    ],
                  }}
                  style={{ minHeight: 240 }}
                />
              </Card>
            </div>

            {/* Robustness table */}
            <Card>
              <SectionTitle>Robustness Summary Table</SectionTitle>
              <div className="overflow-x-auto">
                <table className="w-full text-base">
                  <thead>
                    <tr className="border-b border-dark-border">
                      {['Criterion', 'Stable', 'PM &gt; 45° (good)', 'PM 30–45° (acceptable)', 'PM &lt; 30° (poor)'].map((h, i) => (
                        <th key={i} className="text-left py-2 pr-4 font-semibold text-gray-700"
                          dangerouslySetInnerHTML={{ __html: h }}/>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const total = samples.length
                      const stable = samples.filter(s => s.stable).length
                      const good = samples.filter(s => s.pm > 45).length
                      const accept = samples.filter(s => s.pm > 30 && s.pm <= 45).length
                      const poor = samples.filter(s => s.pm <= 30 && s.pm > -900).length
                      const pct = (n) => `${n} (${Math.round(n / total * 100)}%)`
                      return (
                        <tr className="border-b border-dark-border">
                          <td className="py-2 pr-4 font-medium">All samples (n={total})</td>
                          <td className="py-2 pr-4" style={{ color: stable / total >= 0.9 ? '#22c55e' : '#ef4444' }}>{pct(stable)}</td>
                          <td className="py-2 pr-4 text-green-600">{pct(good)}</td>
                          <td className="py-2 pr-4 text-amber-500">{pct(accept)}</td>
                          <td className="py-2 text-red-500">{pct(poor)}</td>
                        </tr>
                      )
                    })()}
                  </tbody>
                </table>
              </div>
              <p className="text-sm text-gray-600 mt-3 p-3 bg-dark-bg rounded-lg border border-dark-border">
                {stablePct >= 90
                  ? `Controller is robust: ${stablePct}% of samples remain stable under ±${variation}% parameter variation.`
                  : stablePct >= 60
                  ? `Controller has moderate robustness: ${stablePct}% stable. Consider retuning with robustness constraints.`
                  : `Low robustness: only ${stablePct}% of samples stable under ±${variation}% variation. Controller needs redesign.`}
              </p>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}

// ── Main AnalysisPage ─────────────────────────────────────────────────────────

export default function AnalysisPage() {
  const navigate = useNavigate()
  const { plant, criterion, results } = useStore()
  const [activeTab, setActiveTab] = useState(0)

  if (results.kp === null) {
    return (
      <div className="animate-fade-in text-center py-20">
        <div className="text-6xl mb-4">🔬</div>
        <h2 className="text-xl font-semibold text-gray-600 mb-2">No optimization results yet</h2>
        <p className="text-gray-700 mb-6">Run the optimizer first, then come back to analyze the controller.</p>
        <button onClick={() => navigate('/optimizer')} className="btn-primary">Go to Optimizer →</button>
      </div>
    )
  }

  return (
    <div className="animate-fade-in space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="section-title text-2xl">Analysis</h1>
        <p className="section-subtitle">Analyze disturbance rejection, parameter sensitivity, and robustness of the tuned PID controller.</p>
      </div>

      {/* Tab bar */}
      <AppTabs
        tabs={TABS.map(label => ({ label }))}
        activeIndex={activeTab}
        onChange={setActiveTab}
      />

      <div className="pt-2">
        {activeTab === 0 && <DisturbanceTab plant={plant} criterion={criterion} results={results} />}
        {activeTab === 1 && <SensitivityTab plant={plant} criterion={criterion} results={results} />}
        {activeTab === 2 && <RobustnessTab plant={plant} criterion={criterion} results={results} />}
      </div>
    </div>
  )
}
