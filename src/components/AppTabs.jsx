import React from 'react'

export default function AppTabs({ tabs, activeIndex, onChange }) {
  return (
    <div className="flex gap-2">
      {tabs.map((tab, i) => {
        const isActive = i === activeIndex
        return (
          <button
            key={i}
            onClick={() => onChange(i)}
            style={{ fontSize: '0.93rem' }}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md transition-all duration-200 ${
              isActive
                ? 'bg-blue-500 text-white font-medium border border-blue-600'
                : 'bg-transparent text-gray-500 font-normal border border-gray-400 hover:bg-blue-50 hover:text-blue-500 hover:border-blue-400'
            }`}
          >
            {tab.icon && <i className={`ti ${tab.icon}`} style={{ fontSize: 16 }} />}
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
