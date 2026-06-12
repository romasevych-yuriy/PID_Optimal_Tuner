import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import HomePage from './pages/HomePage'
import ModelPage from './pages/ModelPage'
import CriterionPage from './pages/CriterionPage'
import OptimizerPage from './pages/OptimizerPage'
import ResultsPage from './pages/ResultsPage'

export default function App() {
  return (
    <BrowserRouter basename="/PID_Optimal_Tuner">
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
    </BrowserRouter>
  )
}
