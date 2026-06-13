import React from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Home, FunctionSquare, Target, Cpu, BarChart2 } from 'lucide-react'

const steps = [
  { path: '/',          label: 'Home',      short: '1', Icon: Home           },
  { path: '/model',     label: 'Model',     short: '2', Icon: FunctionSquare },
  { path: '/criterion', label: 'Criterion', short: '3', Icon: Target         },
  { path: '/optimizer', label: 'Optimizer', short: '4', Icon: Cpu            },
  { path: '/results',   label: 'Results',   short: '5', Icon: BarChart2      },
]

export default function Navigation() {
  const location = useLocation()
  const currentIdx = steps.findIndex(s => s.path === location.pathname)

  return (
    <nav className="bg-dark-card border-b border-dark-border sticky top-0 z-50 backdrop-blur-sm shadow-sm">
      <div className="container mx-auto px-4 max-w-7xl">
        <div className="flex items-center justify-between h-14">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent-blue flex items-center justify-center text-white font-bold text-sm">P</div>
            <span className="font-bold text-gray-800 hidden sm:block">PID Optimal Tuner</span>
          </div>

          {/* Steps */}
          <div className="flex items-center gap-1">
            {steps.map((step, idx) => {
              const isActive = location.pathname === step.path
              const isDone = idx < currentIdx
              return (
                <NavLink
                  key={step.path}
                  to={step.path}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-accent-blue text-white shadow-lg glow-blue'
                      : isDone
                      ? 'text-accent-blue hover:bg-dark-hover'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-dark-hover'
                  }`}
                >
                  <step.Icon size={15} strokeWidth={1.75} className="hidden lg:block" />
                  <span className="hidden md:block">{step.label}</span>
                  <span className="md:hidden text-xs">{step.short}</span>
                  {isDone && <span className="text-accent-green text-xs">✓</span>}
                </NavLink>
              )
            })}
          </div>
        </div>
      </div>
    </nav>
  )
}
