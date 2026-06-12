import React, { useEffect, useRef } from 'react'

// Singleton Plotly loader — load once, reuse everywhere
let _plotly = null
let _loadPromise = null
function loadPlotly() {
  if (_plotly) return Promise.resolve(_plotly)
  if (!_loadPromise) {
    _loadPromise = import('plotly.js-dist-min').then(mod => {
      _plotly = mod.default ?? mod
      return _plotly
    })
  }
  return _loadPromise
}

export const DARK_LAYOUT = {
  paper_bgcolor: 'transparent',
  plot_bgcolor: '#0f1117',
  font: { color: '#9ca3af', family: 'Inter, system-ui, sans-serif', size: 12 },
  xaxis: {
    gridcolor: '#2a3040',
    linecolor: '#2a3040',
    tickcolor: '#4b5563',
    zerolinecolor: '#2a3040',
  },
  yaxis: {
    gridcolor: '#2a3040',
    linecolor: '#2a3040',
    tickcolor: '#4b5563',
    zerolinecolor: '#2a3040',
  },
  legend: {
    bgcolor: 'rgba(26,31,46,0.8)',
    bordercolor: '#2a3040',
    borderwidth: 1,
  },
  margin: { l: 55, r: 20, t: 40, b: 50 },
}

export default function PlotlyChart({ data, layout = {}, config = {}, style = {}, id }) {
  const divRef = useRef(null)
  const plotted = useRef(false)

  // Render / update effect — fires when data or layout changes
  useEffect(() => {
    if (!divRef.current) return
    let alive = true

    const mergedLayout = {
      ...DARK_LAYOUT,
      ...layout,
      xaxis: { ...DARK_LAYOUT.xaxis, ...(layout.xaxis || {}) },
      yaxis: { ...DARK_LAYOUT.yaxis, ...(layout.yaxis || {}) },
      yaxis2: layout.yaxis2 ? { ...DARK_LAYOUT.yaxis, ...layout.yaxis2 } : undefined,
      font: { ...DARK_LAYOUT.font, ...(layout.font || {}) },
    }

    const mergedConfig = {
      responsive: true,
      displayModeBar: true,
      displaylogo: false,
      modeBarButtonsToRemove: ['lasso2d', 'select2d'],
      toImageButtonOptions: { format: 'png', filename: id || 'chart' },
      ...config,
    }

    loadPlotly().then(Plotly => {
      if (!alive || !divRef.current) return
      if (plotted.current) {
        Plotly.react(divRef.current, data, mergedLayout, mergedConfig)
      } else {
        Plotly.newPlot(divRef.current, data, mergedLayout, mergedConfig)
        plotted.current = true
      }
    })

    // Cancel this render if a newer one starts — do NOT purge here
    return () => { alive = false }
  }, [data, layout, config, id])

  // Purge only when the component truly unmounts
  useEffect(() => {
    return () => {
      if (plotted.current) {
        loadPlotly().then(Plotly => {
          if (divRef.current) Plotly.purge(divRef.current)
        })
        plotted.current = false
      }
    }
  }, [])

  return (
    <div
      ref={divRef}
      style={{ width: '100%', minHeight: 300, ...style }}
      className="rounded-lg overflow-hidden"
    />
  )
}
