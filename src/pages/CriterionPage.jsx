import React from 'react'
import { useNavigate } from 'react-router-dom'
import useStore from '../store/useStore'

const CRITERIA = [
  { key: 'w1', label: 'ITAE',               hat: 'ITÂE', tooltip: 'Penalizes errors that persist over time.\nBest for eliminating long-lasting deviations.\nMost commonly used criterion for PID tuning.' },
  { key: 'w2', label: 'IAE',                hat: 'IÂE',  tooltip: 'Measures total accumulated error regardless of time.\nGood balance between fast response and accuracy.\nLess sensitive to initial transients than ITAE.' },
  { key: 'w3', label: 'ISE',                hat: 'ÎSE',  tooltip: 'Heavily penalizes large errors, tolerates small ones.\nProduces fast response but may cause overshoot.\nSensitive to noise due to squaring.' },
  { key: 'w4', label: 'ITSE',               hat: 'ÎTSE', tooltip: 'Combines time-weighting with squared error penalty.\nSuppresses large early errors and persistent late errors.\nGood for systems where initial overshoot is acceptable.' },
  { key: 'w5', label: 'Overshoot',          hat: 'Ôsh',  tooltip: 'Percentage by which the output exceeds the setpoint.\nCritical for systems with physical limits\n(pressure vessels, mechanical stops, temperature limits).' },
  { key: 'w6', label: 'Rise Time',          hat: 't̂ᵣ',  tooltip: 'Time for the output to first reach the setpoint.\nMinimize for fast-responding systems\n(servo drives, flow control).' },
  { key: 'w7', label: 'Settling Time',      hat: 't̂ₛ',  tooltip: 'Time until the output stays within ±5% of setpoint.\nKey indicator of overall control quality\nand disturbance rejection.' },
  { key: 'w8', label: 'Steady-state Error', hat: 'êₛₛ', tooltip: 'Residual offset between setpoint and final output.\nShould be zero for type-1 systems with integrator.\nCritical for precision positioning and regulation.' },
]

function Tooltip({ text }) {
  return (
    <span className="group relative inline-flex items-center cursor-help ml-1.5">
      <span className="text-gray-400 group-hover:text-gray-600 select-none" style={{ fontSize: '1.7rem', lineHeight: 1 }}>ⓘ</span>
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50" style={{ width: 260 }}>
        <span className="block text-white whitespace-pre-line" style={{ background: '#1e293b', fontSize: 18, borderRadius: 6, padding: '8px 12px', lineHeight: 1.6 }}>
          {text}
        </span>
        <span className="block w-0 h-0 mx-auto" style={{ borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: '6px solid #1e293b' }} />
      </span>
    </span>
  )
}

export default function CriterionPage() {
  const navigate = useNavigate()
  const { criterion, setCriterion, optimizer, setOptimizerConfig } = useStore()

  const toggleEnabled = (key) => {
    const newEnabled = !criterion.enabled[key]
    setCriterion({
      enabled: { ...criterion.enabled, [key]: newEnabled },
      weights: newEnabled
        ? { ...criterion.weights, [key]: criterion.weights[key] > 0 ? criterion.weights[key] : 1 }
        : { ...criterion.weights, [key]: 0 },
    })
  }

  const setWeight = (key, val) => {
    const v = Math.max(0, Math.min(1, parseFloat(val) || 0))
    setCriterion({
      weights: { ...criterion.weights, [key]: v },
      enabled: { ...criterion.enabled, [key]: v > 0 },
    })
  }

  const anyEnabled = Object.values(criterion.enabled).some(Boolean)

  const formulaTerms = CRITERIA
    .filter(c => criterion.enabled[c.key] && criterion.weights[c.key] > 0)
    .map(c => `${criterion.weights[c.key].toFixed(2)}·${c.hat}`)

  return (
    <div className="animate-fade-in space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="section-title text-2xl">Optimization Criterion + Constraints</h1>
        <p className="section-subtitle">Select performance metrics and define constraints for PID tuning.</p>
      </div>

      {/* Cost function formula */}
      <div className="card bg-gradient-to-r from-dark-card to-dark-bg border-accent-blue/20">
        <h2 className="font-semibold text-gray-900 mb-3">Composite Criterion</h2>
        <div className="bg-dark-bg rounded-lg p-4 border border-dark-border flex justify-center">
          <img src="Formula_Cr.jpg" alt="Composite Criterion Formula" className="w-3/4" style={{ mixBlendMode: 'multiply' }} />
        </div>
      </div>

      {/* Criteria selection */}
      <div className="card">
        <h2 className="font-semibold text-gray-900 mb-4">Performance Metrics (enable and set weight coefficients δ)</h2>
        <div className="space-y-3">
          {CRITERIA.map((c, idx) => {
            const active = criterion.enabled[c.key]
            return (
              <div
                key={c.key}
                className={`flex items-center gap-4 p-3 rounded-lg border transition-all duration-200 ${
                  active ? 'border-accent-blue/40 bg-dark-bg' : 'border-dark-border bg-dark-bg/50 opacity-40'
                }`}
              >
                {/* Toggle */}
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => toggleEnabled(c.key)}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-5 bg-dark-border peer-focus:outline-none rounded-full peer peer-checked:bg-accent-blue transition-colors duration-200 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-5"></div>
                </label>

                {/* Label */}
                <div className="flex-1 min-w-0 flex items-center">
                  <span className="font-bold" style={{ fontSize: '1.3rem', color: active ? '#15803d' : '#9ca3af' }}>
                    {c.label}
                  </span>
                  <Tooltip text={c.tooltip} />
                </div>

                {/* Weight slider — always visible, non-interactive when disabled */}
                <div className={`flex items-center gap-3 min-w-[360px] ${!active ? 'pointer-events-none' : ''}`}>
                  <span className="font-bold text-gray-700 shrink-0" style={{ fontSize: '1.5rem' }}>δ<sub>{idx + 1}</sub></span>
                  <input
                    type="range"
                    min="0" max="1" step="0.01"
                    value={criterion.weights[c.key]}
                    onChange={e => setWeight(c.key, e.target.value)}
                    className="flex-1"
                    style={{ accentColor: '#3b82f6' }}
                  />
                  <input
                    type="number"
                    min="0" max="1" step="0.01"
                    value={criterion.weights[c.key]}
                    onChange={e => setWeight(c.key, e.target.value)}
                    className="input-field w-[7.5rem] text-center font-bold"
                    style={{ fontSize: '1.125rem' }}
                  />
                </div>
              </div>
            )
          })}
        </div>

        {/* Live formula */}
        <div className="mt-4 p-4 bg-dark-bg border border-dark-border rounded-lg text-center font-mono" style={{ fontSize: '1.2rem' }}>
          {formulaTerms.length > 0
            ? <span className="text-gray-800 font-semibold">Cr = {formulaTerms.join(' + ')} + Stability Penalty + Constraints Penalty</span>
            : <span className="text-gray-500">Cr = 0 + Stability Penalty + Constraints Penalty</span>
          }
        </div>

        {!anyEnabled && (
          <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-500 text-sm font-bold">
            ⚠️ Select at least one criterion. The optimizer will use ISE by default if none selected.
          </div>
        )}
      </div>

      {/* Constraints */}
      <div className="card">
        <h2 className="font-semibold text-gray-900 mb-4">Constraints</h2>
        <div className="space-y-4">
          {/* Overshoot constraint */}
          <div className={`p-4 rounded-lg border transition-all duration-200 ${criterion.useOvershootConstraint ? 'border-accent-yellow/40 bg-dark-bg' : 'border-dark-border bg-dark-bg/50 opacity-40'}`}>
            <div className="flex items-center gap-3 mb-3">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={criterion.useOvershootConstraint}
                  onChange={e => setCriterion({ useOvershootConstraint: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-10 h-5 bg-dark-border rounded-full peer peer-checked:bg-accent-yellow transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-5"></div>
              </label>
              <span className="font-bold text-gray-900" style={{ fontSize: '1.3rem' }}>Allowable Overshoot</span>
            </div>
            {criterion.useOvershootConstraint && (
              <div className="flex items-center gap-3">
                <input
                  type="range" min="0" max="100" step="1"
                  value={criterion.overshootMax}
                  onChange={e => setCriterion({ overshootMax: parseFloat(e.target.value) })}
                  className="flex-1"
                />
                <input
                  type="number" min="0" max="100" step="1"
                  value={criterion.overshootMax}
                  onChange={e => setCriterion({ overshootMax: parseFloat(e.target.value) || 20 })}
                  className="input-field w-20 text-center font-bold"
                  style={{ fontSize: '1.125rem' }}
                />
                <span className="font-bold text-gray-700 shrink-0" style={{ fontSize: '1.5rem' }}>%</span>
              </div>
            )}
          </div>

          {/* Control constraint */}
          <div className={`p-4 rounded-lg border transition-all duration-200 ${criterion.useControlConstraint ? 'border-accent-red/40 bg-dark-bg' : 'border-dark-border bg-dark-bg/50 opacity-40'}`}>
            <div className="flex items-center gap-3 mb-3">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={criterion.useControlConstraint}
                  onChange={e => setCriterion({ useControlConstraint: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-10 h-5 bg-dark-border rounded-full peer peer-checked:bg-accent-red transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-5"></div>
              </label>
              <span className="font-bold text-gray-900" style={{ fontSize: '1.3rem' }}>
                Control Signal Saturation. u(t) is clipped to [u<sub>min</sub>, u<sub>max</sub>] during simulation
              </span>
            </div>
            {criterion.useControlConstraint && (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-gray-700 shrink-0" style={{ fontSize: '1.5rem' }}>u<sub>min</sub></span>
                  <input
                    type="range" min="-20" max="0" step="0.01"
                    value={criterion.uMin}
                    onChange={e => setCriterion({ uMin: parseFloat(e.target.value) })}
                    className="flex-1"
                  />
                  <input
                    type="number" min="-20" max="0" step="0.01"
                    value={criterion.uMin}
                    onChange={e => setCriterion({ uMin: parseFloat(e.target.value) || -10 })}
                    className="input-field w-[7.5rem] text-center font-bold"
                    style={{ fontSize: '1.125rem' }}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-gray-700 shrink-0" style={{ fontSize: '1.5rem' }}>u<sub>max</sub></span>
                  <input
                    type="range" min="0" max="20" step="0.01"
                    value={criterion.uMax}
                    onChange={e => setCriterion({ uMax: parseFloat(e.target.value) })}
                    className="flex-1"
                  />
                  <input
                    type="number" min="0" max="20" step="0.01"
                    value={criterion.uMax}
                    onChange={e => setCriterion({ uMax: parseFloat(e.target.value) || 10 })}
                    className="input-field w-[7.5rem] text-center font-bold"
                    style={{ fontSize: '1.125rem' }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* PID bounds */}
      <div className="card">
        <h2 className="font-semibold text-gray-900 mb-4">PID Gain Search Bounds. Lower Bounds are 0. Set Upper Bounds.</h2>
        <div className="space-y-3">
          {[
            { key: 'kpMax', sub: 'p', color: '#f59e0b' },
            { key: 'kiMax', sub: 'i', color: '#10b981' },
            { key: 'kdMax', sub: 'd', color: '#3b82f6' },
          ].map(({ key, sub, color }) => (
            <div key={key} className={`flex items-center gap-3 transition-opacity duration-200 ${(optimizer[key] ?? 50) === 0 ? 'opacity-40' : ''}`}>
              <span className="font-bold shrink-0" style={{ fontSize: '1.5rem', color }}>k<sub>{sub}</sub></span>
              <input
                type="range" min="0" max="200" step="0.1"
                value={optimizer[key] ?? 50}
                onChange={e => setOptimizerConfig({ [key]: parseFloat(e.target.value) })}
                className="flex-1"
              />
              <input
                type="number" min="0" max="200" step="0.1"
                value={optimizer[key] ?? 50}
                onChange={e => setOptimizerConfig({ [key]: parseFloat(e.target.value) || 50 })}
                className="input-field w-[7.5rem] text-center font-bold"
                style={{ fontSize: '1.125rem' }}
              />
            </div>
          ))}
        </div>
        {(() => {
          const kp0 = (optimizer.kpMax ?? 50) === 0
          const ki0 = (optimizer.kiMax ?? 50) === 0
          const kd0 = (optimizer.kdMax ?? 50) === 0
          return (
            <div className="mt-4 space-y-1">
              {kp0 && <p className="text-red-500 font-bold text-sm">⚠️ Nonzero value of k<sub>p</sub> must be set</p>}
              {!kp0 && ki0 && kd0 && <p className="text-red-500 font-bold text-sm">⚠️ P-controller will be tuned</p>}
              {!kp0 && kd0 && !ki0  && <p className="text-red-500 font-bold text-sm">⚠️ PI-controller will be tuned</p>}
              {!kp0 && ki0 && !kd0  && <p className="text-red-500 font-bold text-sm">⚠️ PD-controller will be tuned</p>}
            </div>
          )
        })()}
      </div>

      {/* Navigation */}
      <div className="flex justify-between pt-2">
        <button onClick={() => navigate('/model')} className="btn-secondary">← Back</button>
        <button onClick={() => navigate('/optimizer')} className="btn-primary px-8">
          Next: Choose Optimizer →
        </button>
      </div>
    </div>
  )
}
