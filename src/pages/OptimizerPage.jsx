import React, { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import useStore from '../store/useStore'
import PlotlyChart from '../components/PlotlyChart'
import { computeSimParams } from '../math/simulation'

const OPTIMIZERS = [
  { id: 'PSO',    label: 'PSO',          fullName: 'Particle Swarm Optimization',           color: '#3b82f6', desc: 'Standard PSO with fixed inertia weight (w=0.72, c₁=c₂=1.19)' },
  { id: 'LDWPSO', label: 'LDW-PSO',      fullName: 'Linear Decreasing Weight PSO',          color: '#06b6d4', desc: 'PSO with w linearly decreasing from 0.9 to 0.4' },
  { id: 'VCTPSO', label: 'VCT-PSO',      fullName: 'Variable Cognitive Topology PSO',       color: '#8b5cf6', desc: 'Randomizes cognitive reference every RC=5 iterations' },
  { id: 'RingPSO',label: 'Ring-PSO',     fullName: 'Ring Topology PSO',                     color: '#10b981', desc: 'Local ring neighborhood, reduces premature convergence' },
  { id: 'DE',     label: 'DE/best/bin',  fullName: 'Differential Evolution (best/1/bin)',   color: '#f59e0b', desc: 'CR=0.5, SF=0.6 — robust for multimodal problems' },
  { id: 'GWO',    label: 'GWO',          fullName: 'Grey Wolf Optimizer',                   color: '#ef4444', desc: 'α, β, δ wolves guide the search pack' },
]

const WORKER_MAP = {
  PSO:    () => new Worker(new URL('../workers/pso.worker.js', import.meta.url), { type: 'module' }),
  LDWPSO: () => new Worker(new URL('../workers/ldwpso.worker.js', import.meta.url), { type: 'module' }),
  VCTPSO: () => new Worker(new URL('../workers/vctpso.worker.js', import.meta.url), { type: 'module' }),
  RingPSO:() => new Worker(new URL('../workers/ringpso.worker.js', import.meta.url), { type: 'module' }),
  DE:     () => new Worker(new URL('../workers/de.worker.js', import.meta.url), { type: 'module' }),
  GWO:    () => new Worker(new URL('../workers/gwo.worker.js', import.meta.url), { type: 'module' }),
}

export default function OptimizerPage() {
  const navigate = useNavigate()
  const { plant, criterion, optimizer: optConfig, setOptimizerConfig, setResults, resetResults } = useStore()

  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [bestCostLive, setBestCostLive] = useState(null)
  const [convergence, setConvergence] = useState([])
  const [statusMsg, setStatusMsg] = useState('')
  const [done, setDone] = useState(false)
  const [resultSummary, setResultSummary] = useState(null)
  const workerRef = useRef(null)

  const handleRun = useCallback(() => {
    if (running) {
      // Cancel
      if (workerRef.current) { workerRef.current.terminate(); workerRef.current = null }
      setRunning(false)
      setStatusMsg('Optimization cancelled.')
      return
    }

    resetResults()
    setRunning(true)
    setDone(false)
    setProgress(0)
    setBestCostLive(null)
    setConvergence([])
    setStatusMsg('Initializing swarm…')

    // Build config for worker
    const { dt, T } = computeSimParams(plant.den, plant.delay)
    const ensuredCriterion = { ...criterion }
    const anyEnabled = Object.values(criterion.enabled).some(Boolean)
    if (!anyEnabled) {
      ensuredCriterion.enabled = { ...criterion.enabled, w3: true }
      ensuredCriterion.weights = { ...criterion.weights, w3: 1 }
    }

    const config = {
      num: plant.num,
      den: plant.den,
      delay: plant.delay,
      dt,
      T,
      r: 1,
      criterion: ensuredCriterion,
      constraints: {
        useOvershootConstraint: criterion.useOvershootConstraint,
        overshootMax: criterion.overshootMax,
        useControlConstraint: criterion.useControlConstraint,
        uMin: criterion.uMin,
        uMax: criterion.uMax,
      },
      optimizer: {
        population: optConfig.population,
        iterations: optConfig.iterations,
        bounds: optConfig.bounds,
      },
    }

    const worker = WORKER_MAP[optConfig.selected]()
    workerRef.current = worker

    worker.onmessage = (e) => {
      const msg = e.data
      if (msg.type === 'progress') {
        setProgress(msg.percent)
        setBestCostLive(msg.bestCost)
        setStatusMsg(`Iteration ${msg.iteration}/${msg.iterations} — best f_OF = ${msg.bestCost.toExponential(4)}`)
        setConvergence(prev => [...prev, { iter: msg.iteration, cost: msg.bestCost }])
      } else if (msg.type === 'result') {
        setProgress(100)
        setRunning(false)
        setDone(true)
        workerRef.current = null

        const { kp, ki, kd, bestCost, costHistory } = msg

        // Post-process: run full simulation
        import('../math/simulation.js').then(({ simulate }) => {
          import('../math/metrics.js').then(({ computeMetrics, computeBode }) => {
            const simResult = simulate(plant.num, plant.den, plant.delay, kp, ki, kd, {
              dt, T, r: 1,
              uMin: criterion.useControlConstraint ? criterion.uMin : -Infinity,
              uMax: criterion.useControlConstraint ? criterion.uMax : Infinity,
            })

            const metrics = computeMetrics(simResult.t, simResult.y, simResult.u, 1)
            const bode = computeBode(plant.num, plant.den, plant.delay, kp, ki, kd)

            // Check constraints
            const overshootOk = !criterion.useOvershootConstraint || metrics.overshoot <= criterion.overshootMax
            const stableOk = Math.abs(simResult.y[simResult.y.length - 1] - 1) < 0.1

            const allOk = overshootOk && stableOk
            const msgs = []
            if (!stableOk) msgs.push('System did not converge to setpoint (stability issue)')
            if (!overshootOk) msgs.push(`Overshoot ${metrics.overshoot.toFixed(1)}% exceeds limit ${criterion.overshootMax}%`)

            const statusMessage = allOk
              ? '✅ All tuning conditions satisfied!'
              : `⚠️ Some conditions not met: ${msgs.join('; ')}`

            setStatusMsg(statusMessage)
            setResultSummary({ kp, ki, kd, bestCost, metrics, allOk, msgs })
            setConvergence(costHistory.map((c, i) => ({ iter: i, cost: c })))

            setResults({
              kp, ki, kd,
              kpAdj: kp, kiAdj: ki, kdAdj: kd,
              metrics,
              simData: simResult,
              convergence: costHistory,
              finalCost: bestCost,
              freqData: bode,
              allConstraintsMet: allOk,
              statusMessage,
            })
          })
        })
      }
    }

    worker.onerror = (err) => {
      setRunning(false)
      setStatusMsg('Worker error: ' + err.message)
      workerRef.current = null
    }

    worker.postMessage({ config })
  }, [running, plant, criterion, optConfig, resetResults, setResults])

  const convData = convergence.length > 0 ? [{
    x: convergence.map(p => p.iter),
    y: convergence.map(p => p.cost),
    type: 'scatter',
    mode: 'lines',
    name: 'f_OF',
    line: { color: OPTIMIZERS.find(o => o.id === optConfig.selected)?.color || '#3b82f6', width: 2 },
  }] : []

  return (
    <div className="animate-fade-in space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="section-title text-2xl">Optimizer</h1>
        <p className="section-subtitle">Choose and run a metaheuristic optimizer (25 agents, 200 iterations).</p>
      </div>

      {/* Optimizer selection */}
      <div className="card">
        <h2 className="font-semibold text-gray-200 mb-4">Select Optimizer</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {OPTIMIZERS.map(opt => (
            <button
              key={opt.id}
              onClick={() => setOptimizerConfig({ selected: opt.id })}
              disabled={running}
              className={`p-4 rounded-xl border text-left transition-all duration-200 ${
                optConfig.selected === opt.id
                  ? 'border-2 shadow-lg scale-[1.02]'
                  : 'border-dark-border hover:border-gray-500 bg-dark-bg'
              }`}
              style={optConfig.selected === opt.id ? { borderColor: opt.color, backgroundColor: opt.color + '15' } : {}}
            >
              <div className="font-bold text-sm mb-1" style={optConfig.selected === opt.id ? { color: opt.color } : { color: '#e5e7eb' }}>
                {opt.label}
              </div>
              <div className="text-gray-400 text-xs font-medium mb-1">{opt.fullName}</div>
              <div className="text-gray-600 text-xs leading-relaxed">{opt.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Run button */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-gray-300 text-sm font-medium">
              {optConfig.selected} &nbsp;·&nbsp;
              {optConfig.population} agents &nbsp;·&nbsp;
              {optConfig.iterations} iterations
            </p>
            <p className="text-gray-500 text-xs mt-0.5">kp, ki, kd ∈ [0, 100]</p>
          </div>
          <button
            onClick={handleRun}
            className={`px-8 py-3 rounded-lg font-semibold text-white transition-all duration-200 ${
              running
                ? 'bg-red-600 hover:bg-red-500'
                : 'bg-accent-green hover:bg-emerald-400 glow-green'
            }`}
          >
            {running ? '⏹ Stop' : '▶ Run Optimization!'}
          </button>
        </div>

        {/* Progress bar */}
        <div className="relative h-6 bg-dark-bg rounded-full border border-dark-border overflow-hidden">
          <div
            className="absolute left-0 top-0 h-full rounded-full transition-all duration-500"
            style={{
              width: `${progress}%`,
              background: `linear-gradient(90deg, ${OPTIMIZERS.find(o => o.id === optConfig.selected)?.color || '#3b82f6'}, #06b6d4)`,
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center text-xs font-mono text-gray-300">
            {progress > 0 ? `${progress.toFixed(1)}%` : ''}
          </div>
        </div>

        {statusMsg && (
          <p className={`mt-3 text-sm ${
            statusMsg.startsWith('✅') ? 'text-accent-green' :
            statusMsg.startsWith('⚠️') ? 'text-yellow-400' :
            'text-gray-400'
          }`}>
            {statusMsg}
          </p>
        )}
      </div>

      {/* Convergence chart */}
      {convergence.length > 0 && (
        <div className="card animate-slide-up">
          <h2 className="font-semibold text-gray-200 mb-2">Convergence Plot</h2>
          <p className="text-gray-500 text-xs mb-3">Best cost function value vs. iteration</p>
          <PlotlyChart
            id="convergence"
            data={convData}
            layout={{
              xaxis: { title: { text: 'Iteration' } },
              yaxis: { title: { text: 'f_OF (log scale)' }, type: 'log' },
              height: 280,
            }}
          />
          {bestCostLive !== null && (
            <p className="text-gray-500 text-xs mt-2 font-mono">
              Current best: f_OF = {bestCostLive.toExponential(6)}
            </p>
          )}
        </div>
      )}

      {/* Result summary */}
      {resultSummary && done && (
        <div className={`card border-2 animate-slide-up ${resultSummary.allOk ? 'border-accent-green/50' : 'border-yellow-500/50'}`}>
          <h2 className="font-semibold text-gray-200 mb-4">
            {resultSummary.allOk ? '🎉 Optimization Complete!' : '⚠️ Optimization Complete (with warnings)'}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            {[
              { label: 'kp', val: resultSummary.kp, color: 'text-yellow-400' },
              { label: 'ki', val: resultSummary.ki, color: 'text-green-400' },
              { label: 'kd', val: resultSummary.kd, color: 'text-blue-400' },
            ].map(g => (
              <div key={g.label} className="metric-card">
                <div className={`text-2xl font-bold ${g.color} font-mono`}>{g.val.toFixed(4)}</div>
                <div className="text-gray-500 text-xs mt-1">{g.label}</div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {[
              { label: 'Overshoot', val: `${resultSummary.metrics.overshoot.toFixed(2)}%` },
              { label: 'Rise Time', val: `${resultSummary.metrics.riseTime.toFixed(3)} s` },
              { label: 'Settling Time', val: `${resultSummary.metrics.settlingTime.toFixed(3)} s` },
              { label: 'SS Error', val: resultSummary.metrics.ess.toFixed(4) },
            ].map(m => (
              <div key={m.label} className="metric-card">
                <div className="text-base font-bold text-gray-200 font-mono">{m.val}</div>
                <div className="text-gray-500 text-xs mt-1">{m.label}</div>
              </div>
            ))}
          </div>
          {!resultSummary.allOk && (
            <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-yellow-400 text-sm">
              {resultSummary.msgs.map((m, i) => <p key={i}>{m}</p>)}
              <p className="mt-2 text-xs">Try another optimizer or relax constraints.</p>
            </div>
          )}
          <div className="flex gap-3 mt-4">
            <button onClick={handleRun} className="btn-secondary">🔄 Re-run</button>
            <button onClick={() => navigate('/results')} className="btn-primary px-8">
              View Full Results →
            </button>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-2">
        <button onClick={() => navigate('/criterion')} className="btn-secondary">← Back</button>
        {done && (
          <button onClick={() => navigate('/results')} className="btn-primary px-8">
            View Results →
          </button>
        )}
      </div>
    </div>
  )
}
