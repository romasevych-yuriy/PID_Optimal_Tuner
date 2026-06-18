import React, { useEffect, useRef } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import HomePage from './pages/HomePage'
import ModelPage from './pages/ModelPage'
import CriterionPage from './pages/CriterionPage'
import OptimizerPage from './pages/OptimizerPage'
import ResultsPage from './pages/ResultsPage'
import { ToastProvider, useToast } from './components/Toast'
import useStore from './store/useStore'
import { saveSession, lastLoadSource } from './utils/session'

function AppInner() {
  const showToast = useToast()
  const toastShown = useRef(false)

  useEffect(() => {
    // Show one-time restore notification (guard against React StrictMode double-invoke)
    if (!toastShown.current) {
      toastShown.current = true
      if (lastLoadSource === 'url')   showToast('Session loaded from link', 'success')
      else if (lastLoadSource === 'local') showToast('Previous session restored', 'info')
    }

    // Auto-save to localStorage on every store change (debounced 500ms)
    let timer
    const unsub = useStore.subscribe((state) => {
      clearTimeout(timer)
      timer = setTimeout(() => saveSession(state), 500)
    })
    return () => { clearTimeout(timer); unsub() }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="model" element={<ModelPage />} />
          <Route path="criterion" element={<CriterionPage />} />
          <Route path="optimizer" element={<OptimizerPage />} />
          <Route path="results" element={<ResultsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  )
}
