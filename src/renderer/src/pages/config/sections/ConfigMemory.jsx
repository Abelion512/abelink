// Section: Relational Growth (trait meters, reasoning, reset)
import { useEffect } from 'react'
import { getRelationship, saveRelationship } from '../../../api/db'
import { useConfirm } from '../../../hooks/useConfirm'

export default function ConfigMemory({ config, setConfig }) {
  const { confirm } = useConfirm()

  const loadRelationalTraits = async () => {
    const traits = await getRelationship('owner')
    setConfig((prev) => ({ ...prev, _relationalTraits: traits }))
  }

  useEffect(() => {
    loadRelationalTraits()
  }, [])

  const handleResetTraits = async (relationalTraits) => {
    const result = await confirm({
      title: 'Reset Sifat Hubungan?',
      message: 'Ini akan mereset memori sifat kepribadian Mark terhadap Anda (Owner) kembali ke netral (0.5). Lanjutkan?',
      isError: true,
      confirmText: 'Ya, Reset'
    })

    if (result.isConfirmed && relationalTraits) {
      const resetTraits = {
        ...relationalTraits,
        warmth: 0.5,
        sarcasm_level: 0.5,
        trust: 0.5,
        energy: 0.5,
        evalCount: 0,
        lastChatIndex: 0,
        reasoning: 'Direset manual oleh user.'
      }
      await saveRelationship(resetTraits)
      setConfig((prev) => ({ ...prev, _relationalTraits: resetTraits }))
    }
  }

  const relationalTraits = config._relationalTraits

  if (!relationalTraits || config.awarenessEnabled === false) return null

  return (
    <div className="space-y-3 p-3 -mx-2 rounded-lg bg-base-200 mt-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">Relational Growth (Sifat Hubungan)</p>
          <p className="text-xs opacity-50 mt-1">Sifat dan sikap Mark ke kamu yang berkembang otomatis dari pola obrolan.</p>
        </div>
        <button onClick={() => handleResetTraits(relationalTraits)} className="btn btn-xs btn-error btn-outline">
          Reset
        </button>
      </div>
      <div className="grid grid-cols-2 gap-4 mt-2">
        {[
          { label: 'Warmth (Kehangatan)', val: relationalTraits.warmth, color: 'progress-error' },
          { label: 'Sarcasm (Sarkas)', val: relationalTraits.sarcasm_level, color: 'progress-warning' },
          { label: 'Trust (Kepercayaan)', val: relationalTraits.trust, color: 'progress-success' },
          { label: 'Energy (Energi)', val: relationalTraits.energy, color: 'progress-info' },
        ].map((trait, i) => (
          <div key={i} className="space-y-1">
            <div className="flex justify-between text-xs">
              <span>{trait.label}</span>
              <span className="font-mono">{trait.val}</span>
            </div>
            <progress className={`progress ${trait.color} w-full`} value={trait.val} max="1"></progress>
          </div>
        ))}
      </div>
      {relationalTraits.reasoning && (
        <div className="text-xs bg-base-300 p-2 rounded border border-base-content/10 italic text-base-content/70">
          <span className="font-semibold not-italic block mb-1">Reasoning Terakhir:</span>
          {relationalTraits.reasoning}
        </div>
      )}
    </div>
  )
}
