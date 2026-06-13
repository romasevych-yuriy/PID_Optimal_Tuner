import React, { useEffect, useRef } from 'react'
import Plotly from 'plotly.js-dist-min'

export const DARK_LAYOUT = {
  paper_bgcolor: 'transparent',
  plot_bgcolor: '#edf0f6',
  font: { color: '#374151', family: 'Inter, system-ui, sans-serif', size: 12 },
  xaxis: {
    gridcolor: '#b8c4d8',
    linecolor: '#b8c4d8',
    tickcolor: '#6b7280',
    zerolinecolor: '#b8c4d8',
  },
  yaxis: {
    gridcolor: '#b8c4d8',
    linecolor: '#b8c4d8',
    tickcolor: '#6b7280',
    zerolinecolor: '#b8c4d8',
  },
  legend: {
    bgcolor: 'rgba(237,240,246,0.9)',
    bordercolor: '#b8c4d8',
    borderwidth: 1,
  },
  margin: { l: 55, r: 20, t: 40, b: 50 },
}

export default function PlotlyChart({ data, layout = {}, config = {}, style = {}, id }) {
  const divRef = useRef(null)
  const plotted = useRef(false)

  useEffect(() => {
    if (!divRef.current) return

    const mergedLayout = {
      ...DARK_LAYOUT,
      ...layout,
      xaxis: { ...DARK_LAYOUT.xaxis, ...(layout.xaxis || {}) },
      yaxis: { ...DARK_LAYOUT.yaxis, ...(layout.yaxis || {}) },
      ...(layout.yaxis2 ? { yaxis2: { ...DARK_LAYOUT.yaxis, ...layout.yaxis2 } } : {}),
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

    if (plotted.current) {
      Plotly.react(divRef.current, data, mergedLayout, mergedConfig)
    } else {
      Plotly.newPlot(divRef.current, data, mergedLayout, mergedConfig)
      plotted.current = true
    }
  }, [data, layout, config, id])

  useEffect(() => {
    return () => {
      if (plotted.current && divRef.current) {
        Plotly.purge(divRef.current)
      }
      plotted.current = false
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
