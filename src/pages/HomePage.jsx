import React from 'react'
import { useNavigate } from 'react-router-dom'

const features = [
  { icon: '📥', title: 'Two Ways of Plant Specification', desc: 'Import step-response data or specify a transfer function directly.' },
  { icon: '🧬', title: 'Solid Metaheuristic Optimization', desc: 'Six state-of-the-art optimizers: PSO, LDWPSO, VCTPSO, RingPSO, DE/best/bin, GWO.' },
  { icon: '🎯', title: 'Wide Range of Optimization Indicators', desc: 'ITAE, IAE, ISE, ITSE, Overshoot, Rise Time, Settling Time, Steady-state error.' },
  { icon: '🔒', title: 'Tuning Under Constraints', desc: 'Constrain overshoot and control signal bounds simultaneously.' },
  { icon: '📊', title: 'Rich Visualizations', desc: 'Step response, Bode plot, gain/phase margins — all interactive.' },
  { icon: '📄', title: 'PDF Report Generation', desc: 'Export a complete 6-page PDF report with charts, tables, and parameters.' },
]

export default function HomePage() {
  const navigate = useNavigate()

  return (
    <div className="animate-fade-in space-y-12">
      {/* Hero */}
      <section className="text-center pt-8 pb-4">
        <h1 className="text-5xl md:text-6xl font-bold mb-6 leading-tight">
          <span className="text-gradient">PID Optimal Tuner</span>
        </h1>
        <p className="text-gray-300 text-2xl max-w-3xl mx-auto mb-8 leading-relaxed">
          Tune PID controllers optimally using state-of-the-art metaheuristic algorithms.
          Designed for process control, embedded systems, robotics and automation engineers.
        </p>
        <div className="flex flex-wrap gap-3 justify-center">
          <button
            onClick={() => navigate('/model')}
            className="btn-primary px-8 py-3 text-base glow-blue"
          >
            Start Tuning →
          </button>
          <a
            href="mailto:romasevichyuriy@ukr.net"
            className="btn-secondary px-8 py-3 text-base flex items-center gap-2"
          >
            ✉️ Contact
          </a>
          <a
            href="https://ko-fi.com/yurii1"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 font-semibold px-6 py-3 rounded-lg transition-all duration-200 text-base"
          >
            ☕ Support on Ko-fi
          </a>
        </div>
      </section>

      {/* PID Block Diagram + Formula */}
      <section className="card">
        <h2 className="section-title text-center">PID + Plant Architecture</h2>
        <p className="text-gray-400 text-center text-sm mb-5">Parallel PID form implemented in this tool</p>

        <div className="flex justify-center mb-6">
          <img
            src="pid-plant.jpg"
            alt="PID Controller + Plant Block Diagram"
            className="max-w-full rounded-lg border border-dark-border"
            style={{ maxHeight: 380 }}
          />
        </div>

        <div className="flex justify-center">
          <img
            src="pid-formula.jpg"
            alt="PID Controller Formula"
            className="max-w-full rounded-lg"
            style={{ maxHeight: 260, filter: 'invert(1) brightness(0.85)' }}
          />
        </div>
      </section>

      {/* Features */}
      <section>
        <h2 className="section-title text-center mb-8">Key Features</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((f, i) => (
            <div
              key={i}
              className="card hover:border-accent-blue/40 transition-all duration-300 hover:-translate-y-1 group animate-slide-up"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="text-3xl mb-3 group-hover:scale-110 transition-transform duration-200">{f.icon}</div>
              <h3 className="font-semibold text-gray-200 mb-2 text-sm">{f.title}</h3>
              <p className="text-gray-400 text-xs leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Workflow Steps */}
      <section className="card">
        <h2 className="section-title text-center mb-8">How It Works</h2>
        <div className="flex flex-col md:flex-row gap-6 items-center justify-center">
          {[
            { step: '1', label: 'Model', desc: 'Define or identify your plant transfer function', color: 'bg-accent-blue' },
            { step: '2', label: 'Criterion', desc: 'Choose optimization criteria and set constraints', color: 'bg-accent-purple' },
            { step: '3', label: 'Optimize', desc: 'Run a metaheuristic optimizer (25 agents, 200 iter)', color: 'bg-accent-cyan' },
            { step: '4', label: 'Analyze', desc: 'Inspect step response, Bode plot, export PDF', color: 'bg-accent-green' },
          ].map((s, i) => (
            <React.Fragment key={s.step}>
              <div className="flex flex-col items-center text-center max-w-[180px]">
                <div className={`w-14 h-14 rounded-full ${s.color} flex items-center justify-center text-white font-bold text-xl mb-3 shadow-lg`}>{s.step}</div>
                <div className="font-bold text-gray-100 text-base mb-2">{s.label}</div>
                <div className="text-gray-400 text-sm leading-snug">{s.desc}</div>
              </div>
              {i < 3 && <div className="text-gray-400 text-3xl hidden md:block">→</div>}
            </React.Fragment>
          ))}
        </div>
      </section>

      {/* Call to action */}
      <section className="text-center pb-8">
        <button
          onClick={() => navigate('/model')}
          className="btn-primary px-10 py-4 text-lg glow-blue"
        >
          Get Started — Define Your Plant →
        </button>
        <p className="text-gray-500 text-xs mt-4">
          All computations run in your browser. No data is sent to any server.
        </p>
      </section>
    </div>
  )
}
