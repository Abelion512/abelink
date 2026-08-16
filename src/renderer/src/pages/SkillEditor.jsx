import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Save, Trash2, ArrowLeft, Terminal } from 'lucide-react'
import Editor from '@monaco-editor/react'

const SkillEditor = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const [content, setContent] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadContent = async () => {
      try {
        const text = await window.api.readSkill(id)
        setContent(text)
      } catch (e) {
        console.error(e)
      } finally {
        setIsLoading(false)
      }
    }
    loadContent()
  }, [id])

  const handleSave = async () => {
    try {
      await window.api.saveSkill(id, content)
      setIsEditing(false)
    } catch (e) {
      console.error(e)
    }
  }

  const handleDelete = async () => {
    if (!confirm(`Hapus skill ${id}?`)) return
    try {
      await window.api.deleteSkill(id)
      navigate('/skills')
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <div className="h-full flex flex-col p-6 overflow-hidden relative font-['Poppins',sans-serif] bg-base-300 rounded-xl border border-white/5 shadow-2xl">
      {/* Visual Background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,oklch(var(--n))_0%,transparent_70%)] opacity-20 pointer-events-none" />
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-10 pointer-events-none" />
      
      <div className="relative z-10 flex flex-col h-full">
        {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <button 
            className="btn btn-circle btn-ghost" 
            onClick={() => navigate('/skills')}
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Terminal className="text-emerald-400" size={24} />
              {id}.md
            </h2>
            <p className="text-sm text-gray-400">Edit pedoman AI skill</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            className="btn btn-outline btn-error gap-2"
            onClick={handleDelete}
          >
            <Trash2 size={16} /> Delete
          </button>
          <button 
            className={`btn gap-2 ${isEditing ? 'btn-primary' : 'btn-disabled'}`}
            onClick={handleSave}
            disabled={!isEditing}
          >
            <Save size={16} /> Save Changes
          </button>
        </div>
      </div>

      {/* Editor Container */}
      <div className="flex-1 bg-[#1e1e1e] rounded-2xl border border-white/10 overflow-hidden shadow-2xl relative">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            Loading editor...
          </div>
        ) : (
          <Editor
            height="100%"
            defaultLanguage="markdown"
            theme="vs-dark"
            value={content}
            onChange={(val) => {
              setContent(val)
              setIsEditing(true)
            }}
            options={{
              minimap: { enabled: false },
              fontSize: 15,
              wordWrap: 'on',
              padding: { top: 20 },
              scrollBeyondLastLine: false,
              smoothScrolling: true
            }}
          />
        )}
      </div>
      </div>
    </div>
  )
}

export default SkillEditor
