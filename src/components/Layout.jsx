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
      <footer className="border-t border-dark-border py-4 text-center text-gray-500 text-xs">
        <span>PID Optimal Tuner v1.0 &nbsp;·&nbsp; </span>
        <span>Author: Yuriy Romasevych &nbsp;·&nbsp; </span>
        <a href="mailto:romasevichyuriy@ukr.net" className="hover:text-accent-blue transition-colors">romasevichyuriy@ukr.net</a>
        <span> &nbsp;·&nbsp; </span>
        <a href="https://ko-fi.com/yurii1" target="_blank" rel="noopener noreferrer" className="hover:text-accent-yellow transition-colors">☕ Ko-fi</a>
      </footer>
    </div>
  )
}
