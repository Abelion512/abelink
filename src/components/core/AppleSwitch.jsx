

/**
 * AppleSwitch
 * Authentic Apple macOS/iOS Toggle Switch component.
 * Green #30D158 when active, #39393D when inactive, with smooth spring slide.
 */
export function AppleSwitch({ checked = false, onChange, disabled = false, className = '', id, ariaLabel }) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => !disabled && onChange?.(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full p-0.5 transition-colors duration-250 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff] focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:cursor-not-allowed disabled:opacity-40 ${
        checked ? 'bg-[#30d158]' : 'bg-[#39393d]'
      } ${className}`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-[0_2px_4px_rgba(0,0,0,0.35)] transition-transform duration-250 ease-[cubic-bezier(0.25,1,0.5,1)] ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

export default AppleSwitch
