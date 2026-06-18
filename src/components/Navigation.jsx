import React from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Home, Target, Cpu, BarChart2, Link2 } from 'lucide-react'
import useStore from '../store/useStore'
import { useToast } from './Toast'
import { buildShareURL } from '../utils/session'

const steps = [
  { path: '/',          label: 'Home',      short: '1', Icon: Home      },
  { path: '/model',     label: 'Model',     short: '2', tablerIcon: 'ti-arrows-exchange' },
  { path: '/criterion', label: 'Criterion', short: '3', Icon: Target    },
  { path: '/optimizer', label: 'Optimizer', short: '4', Icon: Cpu       },
  { path: '/results',   label: 'Results',   short: '5', Icon: BarChart2 },
]

export default function Navigation() {
  const location = useLocation()
  const currentIdx = steps.findIndex(s => s.path === location.pathname)
  const showToast = useToast()

  const handleCopyLink = async () => {
    const url = buildShareURL(useStore.getState())
    if (!url) { showToast('Failed to build link', 'error'); return }
    try {
      await navigator.clipboard.writeText(url)
      showToast('Link copied to clipboard!', 'success')
    } catch {
      showToast('Copy failed — link: ' + url.slice(0, 60) + '…', 'error')
    }
  }

  return (
    <nav className="bg-dark-card border-b border-dark-border sticky top-0 z-50 backdrop-blur-sm shadow-sm">
      <div className="container mx-auto px-6 max-w-7xl">
        <div className="flex items-center justify-between h-20">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-accent-blue flex items-center justify-center text-white font-bold text-xl">P</div>
            <span className="font-bold text-gray-800 text-xl hidden sm:block">PID Optimal Tuner</span>
          </div>

          {/* Steps + Copy Link */}
          <div className="flex items-center gap-2">
            {steps.map((step, idx) => {
              const isActive = location.pathname === step.path
              const isDone = idx < currentIdx
              return (
                <NavLink
                  key={step.path}
                  to={step.path}
                  className={`flex items-center gap-2 px-6 py-3 rounded-xl text-base font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-accent-blue text-white shadow-lg glow-blue'
                      : isDone
                      ? 'text-accent-blue hover:bg-dark-hover'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-dark-hover'
                  }`}
                >
                  {step.Icon
                    ? <step.Icon size={20} strokeWidth={1.75} className="hidden lg:block" />
                    : <i className={`ti ${step.tablerIcon} hidden lg:block`} style={{ fontSize: 16 }} />
                  }
                  <span className="hidden md:block">{step.label}</span>
                  <span className="md:hidden text-sm">{step.short}</span>
                  {isDone && <span className="text-accent-green text-sm">✓</span>}
                </NavLink>
              )
            })}

            {/* Copy Link */}
            <button
              onClick={handleCopyLink}
              title="Copy shareable link to current session"
              className="flex items-center gap-2 px-4 py-3 rounded-xl text-base font-medium transition-all duration-200 text-gray-600 hover:text-accent-blue hover:bg-dark-hover"
            >
              <Link2 size={20} strokeWidth={1.75} />
              <span className="hidden lg:block text-sm">Copy Link</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  )
}
