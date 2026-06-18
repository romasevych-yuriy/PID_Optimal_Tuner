import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import useStore from './store/useStore.js'
import { loadInitialState } from './utils/session.js'

// Restore session before first render (URL state takes priority over localStorage)
loadInitialState(useStore.getState())

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
