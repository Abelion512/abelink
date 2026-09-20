import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getRelationship, saveRelationship } from '../api/db'
import { useConfirm } from '../hooks/useConfirm'
import {
  FaFire,
  FaTheaterMasks,
  FaHandshake,
  FaBolt,
  FaBrain,
  FaChartLine,
  FaCommentDots,
  FaCubes,
  FaInfoCircle,
  FaChartBar,
  FaClock,
  FaHeart,
  FaShieldAlt,
  FaUndo,
  FaSave,
  FaRobot
} from 'react-icons/fa'

const TRAIT_META = [
  {
    key: 'warmth',
    label: 'Kehangatan',
    desc: 'Kehangatan & keakraban emosional',
    color: 'text-rose-400',
    stroke: '#fb7185',
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/20',
    icon: FaFire
  },
  {
    key: 'sarcasm_level',
    label: 'Sarkasme',
    desc: 'Level sarkas & witty roasting',
    color: 'text-amber-400',
    stroke: '#fbbf24',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    icon: FaTheaterMasks
  },
  {
    key: 'trust',
    label: 'Kepercayaan',
    desc: 'Kepercayaan & keterbukaan',
    color: 'text-emerald-400',
    stroke: '#34d399',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    icon: FaHandshake
  },
  {
    key: 'energy',
    label: 'Energi',
    desc: 'Baseline mood & antusiasme',
    color: 'text-cyan-400',
    stroke: '#22d3ee',
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/20',
    icon: FaBolt
  },
  {
    key: 'obedience',
    label: 'Kepatuhan',
    desc: 'Pelayan patuh vs mandiri kritis',
    color: 'text-purple-400',
    stroke: '#c084fc',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/20',
    icon: FaRobot
  }
]

function describeLevel(val) {
  if (val >= 0.85) return 'Sangat Tinggi'
  if (val >= 0.7) return 'Tinggi'
  if (val >= 0.55) return 'Agak Tinggi'
  if (val >= 0.45) return 'Netral'
  if (val >= 0.3) return 'Agak Rendah'
  if (val >= 0.15) return 'Rendah'
  return 'Sangat Rendah'
}

function describePersonality(traits) {
  if (!traits) return 'Memuat...'
  const { warmth, sarcasm_level, trust, energy, obedience } = traits
  const parts = []

  if (warmth >= 0.7) parts.push('hangat dan akrab')
  else if (warmth <= 0.3) parts.push('dingin dan berjarak')
  else parts.push('ramah standar')

  if (sarcasm_level >= 0.7) parts.push('suka roasting tajam')
  else if (sarcasm_level <= 0.3) parts.push('sopan dan santun')
  else parts.push('witty tapi terkontrol')

  if (trust >= 0.7) parts.push('blak-blakan jujur')
  else if (trust <= 0.3) parts.push('hati-hati dan formal')
  else parts.push('cukup terbuka')

  if (energy >= 0.7) parts.push('penuh semangat')
  else if (energy <= 0.3) parts.push('kalem dan tenang')
  else parts.push('mood stabil')

  if (obedience >= 0.7) parts.push('sangat penurut')
  else if (obedience <= 0.3) parts.push('berani mendebat')

  return `Abelink saat ini bersikap ${parts.join(', ')}.`
}

const TraitRing = ({ value, color, stroke, icon: Icon, label, desc, bg, border }) => {
  const pct = value * 100
  const r = 44
  const circ = 2 * Math.PI * r
  const offset = circ - (pct / 100) * circ

  return (
    <div className={`flex flex-col items-center gap-3 p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.12] transition-all duration-200 hover:bg-white/[0.04]`}>
      <div className="relative w-24 h-24">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 108 108">
          <circle cx="54" cy="54" r={r} fill="none" strokeWidth="6" stroke="rgba(255,255,255,0.06)" />
          <circle
            cx="54"
            cy="54"
            r={r}
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            stroke={stroke}
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className={`absolute inset-0 flex flex-col items-center justify-center ${color}`}>
          <Icon className="text-lg" />
          <span className="text-sm font-semibold font-mono mt-0.5 tracking-tight">{value.toFixed(2)}</span>
        </div>
      </div>
      <div className="text-center w-full">
        <p className={`text-xs font-semibold ${color} tracking-wide`}>{label}</p>
        <p className="text-[10px] leading-tight text-zinc-400 mt-1 min-h-[24px] px-1">{desc}</p>
        <div className="mt-2 pt-2 border-t border-white/[0.06] flex items-center justify-center">
          <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${bg} ${border} ${color}`}>
            {describeLevel(value)}
          </span>
        </div>
      </div>
    </div>
  )
}

const RelationalGrowth = () => {
  const navigate = useNavigate()
  const [traits, setTraits] = useState(null)
  const [loading, setLoading] = useState(true)
  const { confirm, ModalComponent } = useConfirm()

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const rel = await getRelationship('owner')
      setTraits(rel)
    } catch (err) {
      console.error('[RelationalGrowth] Error loading data:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleReset = async () => {
    const result = await confirm({
      title: 'Reset Sifat Hubungan?',
      message: 'Ini akan mereset semua trait Abelink ke baseline netral (0.50). Hubungan evolusi akan dimulai kembali dari awal.',
      isError: true,
      confirmText: 'Ya, Reset'
    })

    if (result.isConfirmed) {
      await saveRelationship({
        userId: 'owner',
        warmth: 0.5,
        sarcasm_level: 0.5,
        trust: 0.5,
        energy: 0.5,
        obedience: 0.5,
        evalCount: 0,
        lastChatIndex: 0,
        reasoning: 'Direset manual oleh user.',
        lastEvaluation: null
      })
      await loadData()
    }
  }

  return (
    <div className="h-screen bg-[#080B09] text-zinc-200 overflow-hidden relative font-['Poppins',sans-serif]">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(6,182,212,0.08),transparent_50%)] pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_80%,rgba(16,185,129,0.04),transparent_40%)] pointer-events-none" />

      {/* Main Content */}
      <div className="relative z-10 w-full h-full overflow-y-auto custom-scrollbar">
        <div className="w-full max-w-6xl mx-auto px-6 lg:px-10 py-8 pb-32 space-y-8">

          {/* Page Header */}
          <div className="flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3.5">
              <button
                type="button"
                onClick={() => navigate('/')}
                className="w-8 h-8 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] flex items-center justify-center text-zinc-300 hover:text-white transition-all shrink-0"
                style={{ WebkitAppRegion: 'no-drag' }}
                title="Kembali ke Dashboard"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="1.1em"
                  height="1.1em"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <div className="flex items-center gap-2.5">
                  <h1 className="text-xl font-semibold text-white tracking-tight">Relational Growth</h1>
                  <span className="text-[11px] text-zinc-500 font-mono tracking-wide">/ Dynamic 4D Persona</span>
                </div>
                <p className="text-zinc-400 text-xs mt-0.5">
                  Evolusi kepribadian, kedekatan, dan pola interaksi Abelink secara adaptif.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleReset}
              className="btn btn-sm rounded-xl gap-1.5 px-3.5 font-medium bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 border border-rose-500/30 transition-all text-xs"
              style={{ WebkitAppRegion: 'no-drag' }}
            >
              <FaUndo className="text-xs" /> Reset Trait
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-64">
              <span className="loading loading-spinner loading-lg text-cyan-400"></span>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Personality Summary Card */}
              <div className="p-6 rounded-3xl bg-black/30 backdrop-blur-2xl border border-white/[0.08] shadow-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-cyan-400 flex items-center gap-2 tracking-wide uppercase">
                    <FaBrain className="text-cyan-400" /> Karakter Dinamis Abelink
                  </p>
                  {traits?.evalCount > 0 && (
                    <div className="flex items-center gap-3 text-[11px] text-zinc-500 font-mono">
                      <span className="flex items-center gap-1"><FaChartBar /> Evolusi #{traits.evalCount}</span>
                      {traits.lastEvaluation && (
                        <span className="flex items-center gap-1">
                          <FaClock /> {new Date(traits.lastEvaluation).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <p className="text-zinc-200 text-base leading-relaxed font-sans">
                  {describePersonality(traits)}
                </p>
              </div>

              {/* Trait Rings Grid */}
              <div className="p-6 rounded-3xl bg-black/30 backdrop-blur-2xl border border-white/[0.08] shadow-2xl space-y-4">
                <p className="text-xs font-semibold text-zinc-400 flex items-center gap-2 uppercase tracking-wide">
                  <FaChartLine className="text-cyan-400" /> Dimensi Trait Relasional
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                  {TRAIT_META.map(t => (
                    <TraitRing
                      key={t.key}
                      value={traits?.[t.key] ?? 0.5}
                      color={t.color}
                      stroke={t.stroke}
                      icon={t.icon}
                      label={t.label}
                      desc={t.desc}
                      bg={t.bg}
                      border={t.border}
                    />
                  ))}
                </div>
              </div>

              {/* Reasoning Log */}
              {traits?.reasoning && (
                <div className="p-6 rounded-3xl bg-black/30 backdrop-blur-2xl border border-white/[0.08] shadow-2xl space-y-3">
                  <p className="text-xs font-semibold text-zinc-400 flex items-center gap-2 uppercase tracking-wide">
                    <FaCommentDots className="text-cyan-400" /> Analisis Drift Terakhir
                  </p>
                  <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
                    <p className="text-xs text-zinc-300 italic leading-relaxed">&ldquo;{traits.reasoning}&rdquo;</p>
                  </div>
                </div>
              )}

              {/* Stats Grid */}
              <div className="p-6 rounded-3xl bg-black/30 backdrop-blur-2xl border border-white/[0.08] shadow-2xl space-y-4">
                <p className="text-xs font-semibold text-zinc-400 flex items-center gap-2 uppercase tracking-wide">
                  <FaCubes className="text-cyan-400" /> Matriks Metrik Hubungan
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                  {[
                    { label: 'Siklus Evaluasi', value: traits?.evalCount || 0, icon: FaChartBar, sub: 'Total drift check', iconColor: 'text-cyan-400' },
                    { label: 'Kehangatan', value: ((traits?.warmth || 0.5) * 100).toFixed(0) + '%', icon: FaFire, sub: describeLevel(traits?.warmth || 0.5), iconColor: 'text-rose-400' },
                    { label: 'Kepercayaan', value: ((traits?.trust || 0.5) * 100).toFixed(0) + '%', icon: FaShieldAlt, sub: describeLevel(traits?.trust || 0.5), iconColor: 'text-emerald-400' },
                    { label: 'Sarkasme', value: ((traits?.sarcasm_level || 0.5) * 100).toFixed(0) + '%', icon: FaTheaterMasks, sub: describeLevel(traits?.sarcasm_level || 0.5), iconColor: 'text-amber-400' },
                    { label: 'Kepatuhan', value: ((traits?.obedience || 0.5) * 100).toFixed(0) + '%', icon: FaRobot, sub: describeLevel(traits?.obedience || 0.5), iconColor: 'text-purple-400' }
                  ].map((stat, i) => {
                    const StatIcon = stat.icon
                    return (
                      <div key={i} className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] transition-all">
                        <div className="flex items-center gap-2 mb-2">
                          <StatIcon className={`text-sm ${stat.iconColor}`} />
                          <span className="text-[11px] text-zinc-400 font-medium">{stat.label}</span>
                        </div>
                        <p className={`text-xl font-bold font-mono tracking-tight ${stat.iconColor}`}>{stat.value}</p>
                        <p className="text-[10px] text-zinc-500 mt-1 font-mono">{stat.sub}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <ModalComponent />
    </div>
  )
}

export default RelationalGrowth
