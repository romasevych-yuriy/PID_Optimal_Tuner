import React from 'react'
import { NavLink, useLocation } from 'react-router-dom'

const steps = [
  { path: '/',          label: 'Home',        short: '1', icon: '🏠' },
  { path: '/model',     label: 'Model',       short: '2', icon: '⚙️' },
  { path: '/criterion', label: 'Criterion',   short: '3', icon: '🎯' },
  { path: '/optimizer', label: 'Optimizer',   short: '4', icon: '🔬' },
  { path: '/results',   label: 'Results',     short: '5', icon: '📊' },
]

export default function Navigation() {
  const location = useLocation()
  const currentIdx = steps.findIndex(s => s.path === location.pathname)

  return (
    <nav className="bg-dark-card border-b border-dark-border sticky top-0 z-50 backdrop-blur-sm">
      <div className="container mx-auto px-4 max-w-7xl">
        <div className="flex items-center justify-between h-14">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent-blue flex items-center justify-center text-white font-bold text-sm">P</div>
            <span className="font-bold text-gray-100 hidden sm:block">PID Optimal Tuner</span>
          </div>

          {/* Steps */}
          <div className="flex items-center gap-1">
            {steps.map((step, idx) => {
              const isActive = location.pathname === step.path
              const isDone = idx < currentIdx
              return (
                <React.Fragment key={step.path}>
                  <NavLink
                    to={step.path}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                      isActive
                        ? 'bg-accent-blue text-white shadow-lg glow-blue'
                        : isDone
                        ? 'text-accent-cyan hover:bg-dark-hover'
                        : 'text-gray-500 hover:text-gray-300 hover:bg-dark-hover'
                    }`}
                  >
                    <span className="hidden lg:block">{step.icon}</span>
                    <span className="hidden md:block">{step.label}</span>
                    <span className="md:hidden text-xs">{step.short}</span>
                    {isDone && <span className="text-accent-green text-xs">✓</span>}
                  </NavLink>
                  {idx < steps.length - 1 && (
                    <span className="text-dark-border text-xs hidden sm:block">›</span>
                  )}
                </React.Fragment>
              )
            })}
          </div>
        </div>
      </div>
    </nav>
  )
}
