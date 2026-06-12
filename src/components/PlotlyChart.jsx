import React, { useEffect, useRef } from 'react'

const DARK_LAYOUT = {
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
  const plotRef = useRef(null)

  useEffect(() => {
    if (!divRef.current) return

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

    import('plotly.js-dist-min').then(mod => {
      const Plotly = mod.default ?? mod
      if (plotRef.current) {
        Plotly.react(divRef.current, data, mergedLayout, mergedConfig)
      } else {
        Plotly.newPlot(divRef.current, data, mergedLayout, mergedConfig)
        plotRef.current = true
      }
    })

    return () => {
      import('plotly.js-dist-min').then(mod => {
        const Plotly = mod.default ?? mod
        if (divRef.current) Plotly.purge(divRef.current)
        plotRef.current = false
      })
    }
  }, [data, layout, config, id])

  return (
    <div
      ref={divRef}
      style={{ width: '100%', minHeight: 300, ...style }}
      className="rounded-lg overflow-hidden"
    />
  )
}

export { DARK_LAYOUT }
