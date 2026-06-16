import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useStore from '../store/useStore'

const CRITERIA = [
  { key: 'w1', label: 'ITAE', fullName: 'Integral of Time × Absolute Error', color: 'text-blue-400',   formula: 'δ₁·ITAE/(T²/2)' },
  { key: 'w2', label: 'IAE',  fullName: 'Integral of Absolute Error',        color: 'text-cyan-400',  formula: 'δ₂·IAE/T' },
  { key: 'w3', label: 'ISE',  fullName: 'Integral of Squared Error',         color: 'text-green-400', formula: 'δ₃·ISE/T' },
  { key: 'w4', label: 'ITSE', fullName: 'Integral of Time × Squared Error',  color: 'text-purple-400',formula: 'δ₄·ITSE/(T²/2)' },
  { key: 'w5', label: 'Overshoot', fullName: 'Maximum Overshoot %',          color: 'text-indigo-400',formula: 'δ₅·Osh/100' },
  { key: 'w6', label: 'Rise Time', fullName: 'Time to reach 90% setpoint',   color: 'text-orange-400',formula: 'δ₆·tr/T' },
  { key: 'w7', label: 'Settling Time', fullName: '±2% settling time',        color: 'text-red-400',   formula: 'δ₇·ts/T' },
  { key: 'w8', label: 'Steady-state Error', fullName: '|r - y(∞)|',          color: 'text-pink-400',  formula: 'δ₈·ess/r' },
]

export default function CriterionPage() {
  const navigate = useNavigate()
  const { criterion, setCriterion, optimizer, setOptimizerConfig } = useStore()

  const toggleEnabled = (key) => {
    setCriterion({ enabled: { ...criterion.enabled, [key]: !criterion.enabled[key] } })
  }

  const setWeight = (key, val) => {
    const v = Math.max(0, Math.min(1, parseFloat(val) || 0))
    setCriterion({ weights: { ...criterion.weights, [key]: v } })
  }

  const anyEnabled = Object.values(criterion.enabled).some(Boolean)

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
          {CRITERIA.map((c, idx) => (
            <div
              key={c.key}
              className={`flex items-center gap-4 p-3 rounded-lg border transition-all duration-200 ${
                criterion.enabled[c.key]
                  ? 'border-accent-blue/40 bg-dark-bg'
                  : 'border-dark-border bg-dark-bg/50'
              }`}
            >
              {/* Toggle */}
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={criterion.enabled[c.key]}
                  onChange={() => toggleEnabled(c.key)}
                  className="sr-only peer"
                />
                <div className="w-10 h-5 bg-dark-border peer-focus:outline-none rounded-full peer peer-checked:bg-accent-blue transition-colors duration-200 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-5"></div>
              </label>

              {/* Label */}
              <div className="flex-1 min-w-0">
                <span className={`font-bold ${c.color}`} style={{ fontSize: '1.3rem' }}>{c.label}</span>
              </div>

              {/* Weight slider */}
              {criterion.enabled[c.key] && (
                <div className="flex items-center gap-3 min-w-[360px]">
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
              )}
            </div>
          ))}
        </div>

        {!anyEnabled && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-500 text-sm font-bold">
            ⚠️ Select at least one criterion. The optimizer will use ISE by default if none selected.
          </div>
        )}
      </div>

      {/* Constraints */}
      <div className="card">
        <h2 className="font-semibold text-gray-900 mb-4">Constraints</h2>
        <div className="space-y-4">
          {/* Overshoot constraint */}
          <div className={`p-4 rounded-lg border transition-all duration-200 ${criterion.useOvershootConstraint ? 'border-accent-yellow/40 bg-dark-bg' : 'border-dark-border bg-dark-bg/50'}`}>
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
          <div className={`p-4 rounded-lg border transition-all duration-200 ${criterion.useControlConstraint ? 'border-accent-red/40 bg-dark-bg' : 'border-dark-border bg-dark-bg/50'}`}>
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
        <h2 className="font-semibold text-gray-900 mb-4">PID Gain Search Bounds</h2>
        <div className="space-y-3">
          {[
            { key: 'kpMax', sub: 'p' },
            { key: 'kiMax', sub: 'i' },
            { key: 'kdMax', sub: 'd' },
          ].map(({ key, sub }) => (
            <div key={key} className="flex items-center gap-3">
              <span className="font-bold text-gray-700 shrink-0" style={{ fontSize: '1.5rem' }}>k<sub>{sub}</sub></span>
              <input
                type="range" min="0" max="100" step="0.1"
                value={optimizer[key] ?? 100}
                onChange={e => setOptimizerConfig({ [key]: parseFloat(e.target.value) })}
                className="flex-1"
              />
              <input
                type="number" min="0" max="100" step="0.1"
                value={optimizer[key] ?? 100}
                onChange={e => setOptimizerConfig({ [key]: parseFloat(e.target.value) || 100 })}
                className="input-field w-[7.5rem] text-center font-bold"
                style={{ fontSize: '1.125rem' }}
              />
            </div>
          ))}
        </div>
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
