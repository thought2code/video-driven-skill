const optionBase =
  'px-2.5 py-1 rounded-full cursor-pointer transition-all duration-300 ease-out'

function segmentedOptionClass(active) {
  return active
    ? `${optionBase} bg-ink-900 text-paper-50 shadow-soft hover:bg-ink-800 hover:shadow-md`
    : `${optionBase} text-ink-500 hover:text-ink-900 hover:bg-paper-50/90 hover:shadow-sm`
}

export default function SegmentedControl({
  value,
  onChange,
  options,
  className = '',
  ariaLabel,
}) {
  return (
    <div
      className={`inline-flex rounded-full bg-paper-200/60 p-0.5 text-[11px] font-medium tracking-wide transition-colors duration-300 hover:bg-paper-200/90 ${className}`}
      role='group'
      aria-label={ariaLabel}
    >
      {options.map(({ id, label }) => (
        <button
          key={id}
          type='button'
          onClick={() => onChange(id)}
          className={segmentedOptionClass(value === id)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
