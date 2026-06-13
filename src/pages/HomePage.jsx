import React from 'react'
import { useNavigate } from 'react-router-dom'
import { SlidersHorizontal, Cpu, BarChart2, Lock, Activity, FileText } from 'lucide-react'

const features = [
  { Icon: SlidersHorizontal, title: 'Two Ways of Plant Specification',       desc: 'Import step-response data or specify a transfer function directly.' },
  { Icon: Cpu,               title: 'Solid Metaheuristic Optimization',      desc: 'Six state-of-the-art optimizers: PSO, LDWPSO, VCTPSO, RingPSO, DE/best/bin, GWO.' },
  { Icon: BarChart2,         title: 'Wide Range of Optimization Indicators', desc: 'ITAE, IAE, ISE, ITSE, Overshoot, Rise Time, Settling Time, Steady-state error.' },
  { Icon: Lock,              title: 'Tuning Under Constraints',              desc: 'Constrain overshoot and control signal bounds simultaneously.' },
  { Icon: Activity,          title: 'Rich Visualizations',                   desc: 'Step response, Bode plot, gain/phase margins — all interactive.' },
  { Icon: FileText,          title: 'PDF Report Generation',                 desc: 'Export a complete 6-page PDF report with charts, tables, and parameters.' },
]

export default function HomePage() {
  const navigate = useNavigate()

  return (
    <div className="animate-fade-in space-y-12">

      {/* Hero — 75 vh */}
      <section className="flex flex-col items-center justify-center text-center min-h-[75vh] pt-16 pb-4">
        <h1 className="text-5xl md:text-6xl font-bold mb-8 leading-tight">
          <span className="text-gradient">PID Optimal Tuner</span>
        </h1>
        <p className="text-gray-700 text-2xl max-w-3xl mx-auto mb-12 leading-relaxed">
          Tune PID controllers optimally using state-of-the-art metaheuristic algorithms.
          Designed for process control, embedded systems, robotics and automation engineers.
        </p>
        <button
          onClick={() => navigate('/model')}
          className="btn-primary px-12 py-4 text-lg glow-blue"
        >
          Start Tuning →
        </button>
      </section>

      {/* PID Block Diagram + Formula — equal-height columns */}
      <section className="card">
        <h2 className="section-title text-center">PID + Plant Architecture</h2>
        <p className="text-gray-500 text-center text-sm mb-6">Parallel PID form implemented in this tool</p>

        <div className="p-2 rounded-lg bg-white/60">
          <img
            src="PID+Plant_Formula.jpg"
            alt="PID Controller + Plant Block Diagram with Formula"
            className="w-full object-contain rounded-md border border-dark-border"
          />
        </div>
      </section>

      {/* Key Features */}
      <section>
        <h2 className="section-title text-center mb-8">Key Features</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map(({ Icon, title, desc }, i) => (
            <div
              key={i}
              className="card hover:border-accent-blue/40 transition-all duration-300 hover:-translate-y-1 group animate-slide-up"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="mb-4 group-hover:scale-110 transition-transform duration-200 w-fit">
                <Icon size={32} className="text-accent-blue" strokeWidth={1.5} />
              </div>
              <h3 className="font-semibold text-gray-700 mb-2 text-base">{title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section className="card">
        <h2 className="section-title text-center mb-8">How It Works</h2>
        <div className="flex flex-col md:flex-row gap-6 items-center justify-center">
          {[
            { step: '1', label: 'Model',    desc: 'Define or identify your plant transfer function',    color: 'bg-accent-blue' },
            { step: '2', label: 'Criterion',desc: 'Choose optimization criteria and set constraints',   color: 'bg-accent-purple' },
            { step: '3', label: 'Optimize', desc: 'Run a metaheuristic optimizer (25 agents, 200 iter)',color: 'bg-accent-cyan' },
            { step: '4', label: 'Analyze',  desc: 'Inspect step response, Bode plot, export PDF',       color: 'bg-accent-green' },
          ].map((s, i) => (
            <React.Fragment key={s.step}>
              <div className="flex flex-col items-center text-center max-w-[180px]">
                <div className={`w-14 h-14 rounded-full ${s.color} flex items-center justify-center text-white font-bold text-xl mb-3 shadow-lg`}>{s.step}</div>
                <div className="font-bold text-gray-800 text-base mb-2">{s.label}</div>
                <div className="text-gray-500 text-sm leading-snug">{s.desc}</div>
              </div>
              {i < 3 && <div className="text-gray-500 text-3xl hidden md:block">→</div>}
            </React.Fragment>
          ))}
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="text-center pb-8">
        <button
          onClick={() => navigate('/model')}
          className="btn-primary px-10 py-4 text-lg glow-blue"
        >
          Start Tuning →
        </button>
        <p className="text-gray-500 text-xs mt-4">
          All computations run in your browser. No data is sent to any server.
        </p>
      </section>

    </div>
  )
}
