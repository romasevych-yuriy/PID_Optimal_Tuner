import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/PID_Optimal_Tuner/',
  worker: {
    format: 'es'
  }
})
