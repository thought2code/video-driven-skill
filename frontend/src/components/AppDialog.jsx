import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

const Box = 'div'

export default function AppDialog({
  open,
  onClose,
  title,
  eyebrow,
  children,
  confirmLabel,
  icon,
}) {
  const { t } = useTranslation()
  const resolvedConfirmLabel = confirmLabel ?? t('dialog.gotIt')

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <Box className='fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6'>
      <button
        type='button'
        aria-label={t('common.close')}
        className='absolute inset-0 cursor-pointer bg-ink-900/35 backdrop-blur-[3px] animate-fade-in'
        onClick={onClose}
      />
      <Box
        role='dialog'
        aria-modal='true'
        aria-labelledby='app-dialog-title'
        className='relative z-10 w-full max-w-[440px] card-paper corner-mark shadow-lift animate-fade-up overflow-hidden'
      >
        <Box className='pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-umber-400/12 blur-2xl' />
        <Box className='pointer-events-none absolute -bottom-10 -left-6 h-28 w-28 rounded-full bg-sage-300/20 blur-2xl' />

        <Box className='relative px-6 pt-6 pb-5'>
          <Box className='flex items-start gap-4'>
            {icon && (
              <Box className='flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-umber-50 ring-1 ring-umber-300/45 text-umber-600'>
                {icon}
              </Box>
            )}
            <Box className='min-w-0 flex-1 pt-0.5'>
              {eyebrow && <Box className='eyebrow mb-2'>{eyebrow}</Box>}
              <h2
                id='app-dialog-title'
                className='font-display text-[22px] leading-snug text-ink-900'
              >
                {title}
              </h2>
            </Box>
          </Box>

          <Box className='mt-4 text-[13.5px] leading-relaxed text-ink-600'>{children}</Box>

          <Box className='mt-6 flex justify-end'>
            <button type='button' onClick={onClose} className='btn-primary min-w-[108px] justify-center'>
              {resolvedConfirmLabel}
            </button>
          </Box>
        </Box>
      </Box>
    </Box>
  )
}
