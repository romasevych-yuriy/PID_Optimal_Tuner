import React from 'react'
import { Outlet } from 'react-router-dom'
import Navigation from './Navigation'

export default function Layout() {
  return (
    <div className="min-h-screen bg-dark-bg flex flex-col">
      <Navigation />
      <main className="flex-1 container mx-auto px-4 py-6 max-w-7xl">
        <Outlet />
      </main>
      <footer className="border-t border-dark-border py-5 text-center text-gray-700 text-sm">
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
          <span className="font-medium">PID Optimal Tuner v1.0</span>
          <span className="text-gray-400">·</span>
          <span>Author: Yuriy Romasevych</span>
          <span className="text-gray-400">·</span>
          <a href="mailto:romasevichyuriy@ukr.net" className="hover:text-accent-blue transition-colors">romasevichyuriy@ukr.net</a>
          <span className="text-gray-400">·</span>
          <a
            href="https://ko-fi.com/yurii1"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-yellow-400 hover:bg-yellow-300 text-yellow-900 font-bold px-6 py-2.5 rounded-xl transition-colors text-base shadow-md"
          >
            ☕ Support on Ko-fi
          </a>
        </div>
      </footer>
    </div>
  )
}
