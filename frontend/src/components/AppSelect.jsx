import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'

/**
 * @typedef {{ value: string, label: string }} AppSelectOption
 */

/** @type {Record<string, { trigger: { base: string, closed: string, open: string, disabled: string }, panel: string, item: string, itemHighlight: string, check: string, chevronOpen: string, chevronIdle: string, chevronHover: string }>} */
const VARIANTS = {
  default: {
    trigger: {
      base: 'bg-paper-50 text-ink-900 shadow-hairline',
      closed: 'border-ink-900/10 hover:border-ink-900/18 hover:bg-paper-50/95 active:scale-[0.995]',
      open: 'border-umber-400/70 bg-paper-50 shadow-[0_0_0_3px_rgba(184,138,94,0.12)]',
      disabled: 'border-ink-900/6 opacity-50',
    },
    panel: 'border-ink-900/10 bg-paper-50 shadow-lift',
    item: 'text-ink-700 hover:bg-paper-200/50',
    itemHighlight: 'bg-umber-50/90 text-ink-900',
    check: 'text-umber-500',
    chevronOpen: 'rotate-180 text-umber-500',
    chevronIdle: 'text-ink-400',
    chevronHover: 'group-hover:text-ink-500',
  },
  dark: {
    trigger: {
      base: 'bg-slate-800 text-slate-200',
      closed: 'border-slate-700 hover:border-slate-600 hover:bg-slate-700/40 active:scale-[0.995]',
      open: 'border-slate-500 bg-slate-800 shadow-[0_0_0_3px_rgba(100,116,139,0.22)]',
      disabled: 'border-slate-800 opacity-50',
    },
    panel: 'border-slate-700 bg-slate-800 shadow-xl',
    item: 'text-slate-300 hover:bg-slate-700/55',
    itemHighlight: 'bg-slate-700 text-slate-100',
    check: 'text-sky-400',
    chevronOpen: 'rotate-180 text-sky-400',
    chevronIdle: 'text-slate-500',
    chevronHover: 'group-hover:text-slate-400',
  },
}

const SIZES = {
  md: {
    trigger: 'rounded-xl px-3 py-2.5 text-[13px]',
    item: 'rounded-lg px-2.5 py-2 text-[13px]',
    chevron: 'h-4 w-4',
    check: 'h-3.5 w-3.5',
  },
  sm: {
    trigger: 'rounded-lg px-2.5 py-1.5 text-xs',
    item: 'rounded-md px-2 py-1.5 text-xs',
    chevron: 'h-3.5 w-3.5',
    check: 'h-3 w-3',
  },
}

/**
 * @param {{
 *   value: string
 *   onChange: (value: string) => void
 *   options: AppSelectOption[]
 *   disabled?: boolean
 *   className?: string
 *   variant?: 'default' | 'dark'
 *   size?: 'md' | 'sm'
 *   id?: string
 *   'aria-label'?: string
 * }} props
 */
export default function AppSelect({
  value,
  onChange,
  options,
  disabled = false,
  className = '',
  variant = 'default',
  size = 'md',
  id: idProp,
  'aria-label': ariaLabel,
}) {
  const autoId = useId()
  const triggerId = idProp || autoId
  const listboxId = `${triggerId}-listbox`

  const v = VARIANTS[variant] ?? VARIANTS.default
  const s = SIZES[size] ?? SIZES.md

  const [open, setOpen] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const [menuStyle, setMenuStyle] = useState(null)
  const rootRef = useRef(null)
  const listRef = useRef(null)
  const itemRefs = useRef([])

  const selectedIndex = options.findIndex(o => o.value === value)
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null

  const close = useCallback(() => {
    setOpen(false)
    setHighlightIndex(-1)
    setMenuStyle(null)
  }, [])

  const selectAt = useCallback(
    (index) => {
      const opt = options[index]
      if (!opt) return
      onChange(opt.value)
      close()
      requestAnimationFrame(() => {
        document.getElementById(triggerId)?.focus()
      })
    },
    [close, onChange, options, triggerId],
  )

  const positionMenu = useCallback(() => {
    const el = rootRef.current
    const list = listRef.current
    if (!el || !list) return

    const rect = el.getBoundingClientRect()
    const gap = 6
    const spaceBelow = window.innerHeight - rect.bottom - gap
    const spaceAbove = rect.top - gap
    const contentH = list.scrollHeight
    const openUp = spaceBelow < contentH && spaceAbove > spaceBelow
    const available = openUp ? spaceAbove : spaceBelow
    const needsScroll = contentH > available
    const panelH = needsScroll ? available : contentH

    setMenuStyle({
      position: 'fixed',
      left: rect.left,
      width: rect.width,
      zIndex: 250,
      height: panelH,
      overflowY: needsScroll ? 'auto' : 'hidden',
      visibility: 'visible',
      ...(openUp
        ? { bottom: window.innerHeight - rect.top + gap }
        : { top: rect.bottom + gap }),
    })
  }, [])

  useLayoutEffect(() => {
    if (!open) {
      setMenuStyle(null)
      return
    }
    positionMenu()
    const raf = requestAnimationFrame(positionMenu)
    window.addEventListener('resize', positionMenu)
    window.addEventListener('scroll', positionMenu, true)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', positionMenu)
      window.removeEventListener('scroll', positionMenu, true)
    }
  }, [open, options.length, size, positionMenu])

  useEffect(() => {
    if (!open) return
    const onDocPointer = (e) => {
      if (rootRef.current?.contains(e.target)) return
      if (listRef.current?.contains(e.target)) return
      close()
    }
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
        document.getElementById(triggerId)?.focus()
      }
    }
    document.addEventListener('mousedown', onDocPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [close, open, triggerId])

  useEffect(() => {
    if (!open) return
    const idx = selectedIndex >= 0 ? selectedIndex : 0
    setHighlightIndex(idx)
    requestAnimationFrame(() => {
      itemRefs.current[idx]?.scrollIntoView({ block: 'nearest' })
    })
  }, [open, selectedIndex])

  useEffect(() => {
    if (!open || highlightIndex < 0) return
    itemRefs.current[highlightIndex]?.scrollIntoView({ block: 'nearest' })
  }, [highlightIndex, open])

  const onTriggerKeyDown = (e) => {
    if (disabled) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setOpen(v => !v)
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) {
        setOpen(true)
        return
      }
      const delta = e.key === 'ArrowDown' ? 1 : -1
      setHighlightIndex(i => {
        const next = i < 0 ? (selectedIndex >= 0 ? selectedIndex : 0) : i + delta
        return Math.max(0, Math.min(options.length - 1, next))
      })
    }
    if (e.key === 'Home' && open) {
      e.preventDefault()
      setHighlightIndex(0)
    }
    if (e.key === 'End' && open) {
      e.preventDefault()
      setHighlightIndex(options.length - 1)
    }
  }

  const onListKeyDown = (e) => {
    if (e.key === 'Enter' && highlightIndex >= 0) {
      e.preventDefault()
      selectAt(highlightIndex)
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIndex(i => Math.min(options.length - 1, (i < 0 ? selectedIndex : i) + 1))
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIndex(i => Math.max(0, (i < 0 ? selectedIndex : i) - 1))
    }
  }

  const listPanel = open && options.length > 0 && (
    <ul
      id={listboxId}
      ref={listRef}
      role='listbox'
      aria-labelledby={ariaLabel ? undefined : triggerId}
      aria-label={ariaLabel}
      tabIndex={-1}
      onKeyDown={onListKeyDown}
      style={
        menuStyle ?? {
          position: 'fixed',
          left: rootRef.current?.getBoundingClientRect().left ?? 0,
          width: rootRef.current?.getBoundingClientRect().width ?? 200,
          top: -9999,
          visibility: 'hidden',
        }
      }
      className={`app-select-panel rounded-xl border p-1 ${v.panel}`}
    >
      {options.map((opt, index) => {
        const isSelected = opt.value === value
        const isHighlighted = index === highlightIndex
        return (
          <li
            key={opt.value}
            ref={el => { itemRefs.current[index] = el }}
            role='option'
            aria-selected={isSelected}
            onMouseEnter={() => setHighlightIndex(index)}
            onMouseDown={e => e.preventDefault()}
            onClick={() => selectAt(index)}
            className={`
              flex cursor-pointer items-center gap-2 leading-snug transition-colors duration-150 ease-out
              ${s.item}
              ${isHighlighted ? v.itemHighlight : v.item}
              ${isSelected ? 'font-medium' : ''}
            `}
          >
            <span className='min-w-0 flex-1 break-all'>{opt.label}</span>
            {isSelected && (
              <Check className={`${s.check} shrink-0 ${v.check}`} strokeWidth={2.5} aria-hidden />
            )}
          </li>
        )
      })}
    </ul>
  )

  return (
    <>
      <div ref={rootRef} className={`relative ${className}`}>
        <button
          type='button'
          id={triggerId}
          disabled={disabled}
          aria-label={ariaLabel}
          aria-haspopup='listbox'
          aria-expanded={open}
          aria-controls={listboxId}
          onClick={() => !disabled && setOpen(v => !v)}
          onKeyDown={onTriggerKeyDown}
          className={`
            group flex w-full items-center gap-2 border text-left outline-none
            transition-[border-color,box-shadow,background-color,transform] duration-200 ease-out
            ${s.trigger} ${v.trigger.base}
            ${disabled
              ? `cursor-not-allowed ${v.trigger.disabled}`
              : open
                ? v.trigger.open
                : v.trigger.closed}
          `}
        >
          <span className='min-w-0 flex-1 truncate leading-snug' title={selected?.label}>
            {selected?.label ?? '—'}
          </span>
          <ChevronDown
            className={`${s.chevron} shrink-0 transition-transform duration-300 ease-out ${v.chevronIdle}
              ${open ? v.chevronOpen : v.chevronHover}`}
            aria-hidden
          />
        </button>
      </div>
      {typeof document !== 'undefined' && listPanel && createPortal(listPanel, document.body)}
    </>
  )
}
