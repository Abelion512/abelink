import React from 'react'
import { Check } from 'lucide-react'
import { resolveChoice } from '../../api/choiceBus'

// Tombol opsi ask-choice — satu-satunya sumber UI pilihan (dipakai
// MessageBubble di chat DAN ResponseArea di home). Klik me-resolve janji
// choiceBus sehingga loop agent lanjut otomatis, tanpa ketik.
export const ChoiceButtons = React.memo(({ choice }) => {
  if (!choice || !Array.isArray(choice.options) || choice.options.length === 0) return null
  return (
    <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-white/10">
      <span className="text-[10px] font-bold opacity-50 w-full uppercase tracking-wider">
        {choice.selected != null ? 'Pilihan Anda:' : 'Pilih satu:'}
      </span>
      {choice.options.map((opt, i) => {
        const isSelected = choice.selected === opt
        const done = choice.selected != null
        return (
          <button
            key={i}
            disabled={done}
            onClick={() => resolveChoice(choice.id, opt)}
            className={`btn btn-xs normal-case text-[11px] flex items-center gap-1.5 border transform transition hover:scale-105 ${
              isSelected
                ? 'btn-primary border-primary'
                : 'btn-neutral bg-base-300 border-primary/20 hover:border-primary/50'
            } ${done && !isSelected ? 'opacity-40' : ''}`}
            title={opt}
          >
            {isSelected && <Check className="w-3 h-3" />}
            <span className="truncate max-w-[220px]">{opt}</span>
          </button>
        )
      })}
      {choice.selected == null && (
        <button
          onClick={() => resolveChoice(choice.id, null)}
          className="btn btn-xs btn-ghost normal-case text-[10px] text-white/50 hover:text-white"
        >
          Batal
        </button>
      )}
    </div>
  )
})
