import { useState, useEffect } from 'react'
import { getAllConfig, saveConfiguration } from '../api/db'
import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import { useLocation } from 'react-router-dom'
import { useConfirm } from '../hooks/useConfirm'
import { useChat } from '../contexts/ChatContext'
import ConfigSidebar from './config/ConfigSidebar'
import ConfigProviderKeys from './config/sections/ConfigProviderKeys'
import ConfigPersona from './config/sections/ConfigPersona'
import ConfigIntegrations from './config/sections/ConfigIntegrations'
import ConfigVoice from './config/sections/ConfigVoice'
import ConfigCamera from './config/sections/ConfigCamera'
import ConfigAdmin from './config/sections/ConfigAdmin'
import ConfigChat from './config/sections/ConfigChat'
import ConfigMemory from './config/sections/ConfigMemory'

const Configuration = ({ isFirstSetup = false, onSetupComplete = null }) => {
  const [config, setConfig] = useState({
    personality: 'Santai layaknya seorang teman dan suka bercanda.',
    model: 'google/gemma-3-4b',
    temperature: 0,
    context: 10,
    ttsRate: 0,
    ttsPitch: 0,
    groqApiKey: '',
    aiProvider: 'lmstudio',
    groqModel: 'llama-3.1-8b-instant',
    waAdminNumber: '',
    micDeviceId: 'default',
    awarenessEnabled: true,
    cameraDeviceId: 'default',
    cameraEnabled: true
  })
  const [audioDevices, setAudioDevices] = useState([])
  const [videoDevices, setVideoDevices] = useState([])
  const [activeSection, setActiveSection] = useState('provider')
  const { confirm, ModalComponent } = useConfirm()
  const chatContext = useChat()
  const location = useLocation()

  const loadConfig = async () => {
    const data = await getAllConfig()
    if (data.length > 0) {
      setConfig((prev) => ({
        ...prev,
        ...data[0],
        aiProvider: data[0].aiProvider?.replace('lm-studio', 'lmstudio') || 'lmstudio',
        micDeviceId: data[0].micDeviceId || 'default',
        awarenessEnabled: data[0].awarenessEnabled ?? true
      }))
    }
  }

  useEffect(() => {
    loadConfig()

    navigator.mediaDevices
      .getUserMedia({ audio: true, video: true })
      .then((stream) => {
        navigator.mediaDevices
          .enumerateDevices()
          .then((devices) => {
            const mics = devices.filter((d) => d.kind === 'audioinput')
            const cameras = devices.filter((d) => d.kind === 'videoinput')
            setAudioDevices(mics)
            setVideoDevices(cameras)
          })
          .catch((err) => console.error('Error enumerating devices', err))
        stream.getTracks().forEach(track => track.stop())
      })
      .catch((err) => console.error('Mic/Cam permission denied', err))
  }, [])

  useEffect(() => {
    if (location.state?.highlightAdmin) {
      loadConfig()
      setActiveSection('admin')
      setTimeout(() => {
        const el = document.getElementById('tour-wa-admin')
        if (el) el.scrollIntoView({ behavior: 'smooth' })
      }, 500)
    }
  }, [location.state])

  useEffect(() => {
    if (window.api?.onWaAdminRequest) {
      window.api.onWaAdminRequest((data) => {
        setConfig((prev) => {
          const pending = prev.waPendingAdmins || []
          if (!pending.find((p) => p.id === data.id)) {
            return { ...prev, waPendingAdmins: [...pending, data] }
          }
          return prev
        })
      })
    }
  }, [])

  useEffect(() => {
    if (isFirstSetup) {
      setTimeout(() => {
        const driverObj = driver({
          showProgress: true,
          animate: true,
          nextBtnText: 'Lanjut',
          prevBtnText: 'Kembali',
          doneBtnText: 'Paham!',
          steps: [
            {
              element: '#tour-ai-provider',
              popover: {
                title: '1. Pilih Mesin AI',
                description:
                  'Kamu bisa milih mau pakai AI lokal (gratis & privat pakai LM Studio) atau API Cloud kayak Groq buat respons yang jauh lebih kenceng.',
                side: 'bottom',
                align: 'start'
              }
            },
            {
              element: '#tour-groq-key',
              popover: {
                title: '2. Wajib: Groq API Key',
                description:
                  'Nah ini penting! Karena fitur ngobrol pakai suara (Speech-to-Text) eksklusif pakai Groq, bagian ini WAJIB kamu isi walaupun pakai AI lokal.',
                side: 'top',
                align: 'start'
              }
            },
            {
              element: '#tour-persona',
              popover: {
                title: '3. Kepribadian Mark',
                description:
                  'Di sini kamu bebas nentuin gaya bicara Mark. Mau dia formal kayak asisten pro, atau santai kayak temen nongkrong? Tulis aja di sini!',
                side: 'top',
                align: 'start'
              }
            },
            {
              element: '#tour-temperature',
              popover: {
                title: '4. Temperatur Kreativitas',
                description:
                  'Makin tinggi, makin liar jawabannya. 0 = konsisten & presisi, 1 = kreatif & random. Recomended: 0 untuk kerjaan serius.',
                side: 'top',
                align: 'start'
              }
            },
            {
              element: '#tour-context',
              popover: {
                title: '5. Context Window',
                description:
                  'Berapa banyak pesan yang Mark ingat dalam obrolan. 10 itu cukup buat kebanyakan situasi.',
                side: 'top',
                align: 'start'
              }
            },
            {
              element: '#tour-tts',
              popover: {
                title: '6. Suara Mark',
                description:
                  'Atur kecepatan dan nada bicara Mark. Coba dulu sebelum disimpan!',
                side: 'top',
                align: 'start'
              }
            },
            {
              element: '#tour-save-btn',
              popover: {
                title: '7. Simpan & Mulai!',
                description:
                  'Semua pengaturan bakal disimpan dan Mark langsung aktif. Selamat ngobrol!',
                side: 'top',
                align: 'start'
              }
            }
          ]
        })
        driverObj.drive()
      }, 600)
    }
  }, [isFirstSetup])

  const handleBack = () => window.history.back()

  // Auto-save config on change (debounced 800ms)
  useEffect(() => {
    const timer = setTimeout(async () => {
      // Skip if config is still initial/default (no loaded data)
      if (!config.model && !config.groqApiKey) return
      try {
        await saveConfiguration(config)
        if (chatContext?.setConfig) chatContext.setConfig([config])
      } catch (e) {
        console.error('[Config] auto-save failed:', e)
      }
    }, 800)
    return () => clearTimeout(timer)
  }, [config])

  const renderActiveSection = () => {
    const aiProps = { config, setConfig, isFirstSetup, onSetupComplete, chatContext }
    switch (activeSection) {
      case 'provider': return <ConfigProviderKeys {...aiProps} />
      case 'persona': return <ConfigPersona config={config} setConfig={setConfig} />
      case 'integrations': return <ConfigIntegrations config={config} setConfig={setConfig} />
      case 'camera': return <ConfigCamera config={config} setConfig={setConfig} videoDevices={videoDevices} />
      case 'voice': return <ConfigVoice config={config} setConfig={setConfig} audioDevices={audioDevices} />
      case 'memory': return <ConfigMemory config={config} setConfig={setConfig} />
      case 'admin': return <ConfigAdmin config={config} setConfig={setConfig} />
      case 'chat': return !isFirstSetup ? <ConfigChat /> : null
      default: return <ConfigProviderKeys {...aiProps} onDownloadStateChange={onDownloadStateChange} />
    }
  }

  return (
    <div className="h-screen bg-[var(--base-300)] text-white overflow-hidden relative font-['Poppins',sans-serif]">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,oklch(var(--n))_0%,transparent_70%)] opacity-20 pointer-events-none" />
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-10 pointer-events-none" />

      {/* Sidebar + Content Layout */}
      <div className="relative z-10 flex h-full">
        {/* Sidebar - hidden on mobile, shown on md+ */}
        <div className="hidden md:flex flex-col w-56 lg:w-64 border-r border-base-content/10 bg-base-300/50 backdrop-blur-sm">
          <div className="p-4 pb-2">
            <h1 className="text-lg font-bold">
              {isFirstSetup ? 'Selamat Datang!' : 'Pengaturan'}
            </h1>
            <p className="text-xs opacity-50 mt-1">
              {isFirstSetup ? 'Atur Mark dulu' : 'Sesuaikan Mark'}
            </p>
          </div>
          <ConfigSidebar
            activeSection={activeSection}
            onSectionChange={setActiveSection}
            onBack={handleBack}
            isFirstSetup={isFirstSetup}
            hasChat={!isFirstSetup}
          />
        </div>

        {/* Mobile: top bar with section selector */}
        <div className="md:hidden fixed top-0 left-0 right-0 z-20 bg-base-300/90 backdrop-blur-sm border-b border-base-content/10">
          <div className="flex items-center gap-2 px-3 py-2">
            {!isFirstSetup && (
              <button onClick={handleBack} className="btn btn-ghost btn-sm btn-circle">
                <svg xmlns="http://www.w3.org/2000/svg" width="1.2em" height="1.2em" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <h1 className="text-base font-bold flex-1">
              {isFirstSetup ? 'Selamat Datang!' : 'Pengaturan'}
            </h1>
          </div>
          {/* Mobile horizontal scroll tabs */}
          <div className="flex overflow-x-auto px-2 pb-2 gap-1 scrollbar-hide">
            {[
              { id: 'provider', label: 'Provider' },
              { id: 'persona', label: 'Persona' },
              { id: 'integrations', label: 'Integrasi' },
              { id: 'camera', label: 'Kamera' },
              { id: 'voice', label: 'Suara' },
              { id: 'memory', label: 'Memori' },
              { id: 'admin', label: 'Admin' },
              ...(!isFirstSetup ? [{ id: 'chat', label: 'Chat' }] : [])
            ].map(item => (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-all ${
                  activeSection === item.id
                    ? 'bg-primary text-primary-content font-semibold'
                    : 'bg-base-200 opacity-70'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content Pane */}
        <main className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="max-w-2xl mx-auto px-4 py-6 pb-32 md:py-8 pt-20 md:pt-8">
            {/* Section title for desktop */}
            <div className="hidden md:block mb-6">
              <h2 className="text-xl font-bold">
                {{
                  provider: 'Provider & Keys',
                  persona: 'Persona & Behavior',
                  integrations: 'Integrasi',
                  camera: 'Kamera & Visual',
                  voice: 'Suara & TTS',
                  memory: 'Relational Growth',
                  admin: 'WhatsApp Admin',
                  chat: 'Data & Chat'
                }[activeSection]}
              </h2>
              <div className="divider mt-2 mb-0" />
            </div>

            {renderActiveSection()}
          </div>
        </main>
      </div>

      <ModalComponent />
    </div>
  )
}

export default Configuration
