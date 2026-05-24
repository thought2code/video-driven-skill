import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  blobToRecordingFile,
  formatRecordingDuration,
  formatRecordingSize,
  isScreenRecordingSupported,
  pickRecorderMimeType,
  recordingErrorMessage,
  stopMediaStream,
} from '../utils/screenRecorder.js'

const PHASE = {
  CHECKING: 'checking',
  PICKING: 'picking',
  RECORDING: 'recording',
  PREVIEW: 'preview',
  UPLOADING: 'uploading',
  ERROR: 'error',
}

export default function ScreenRecorderModal({ open, onClose, onUpload }) {
  const { t } = useTranslation()
  const [phase, setPhase] = useState(PHASE.CHECKING)
  const [error, setError] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [recordedBlob, setRecordedBlob] = useState(null)
  const [uploadProgress, setUploadProgress] = useState(0)

  const streamRef = useRef(null)
  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const liveVideoRef = useRef(null)
  const mimeTypeRef = useRef('')
  const startedAtRef = useRef(0)
  const timerRef = useRef(null)
  const previewUrlRef = useRef(null)

  const revokePreview = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
    setPreviewUrl(null)
  }, [])

  const cleanupCapture = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    recorderRef.current = null
    chunksRef.current = []
    stopMediaStream(streamRef.current)
    streamRef.current = null
    if (liveVideoRef.current) liveVideoRef.current.srcObject = null
    revokePreview()
    setRecordedBlob(null)
    setElapsed(0)
  }, [revokePreview])

  const resetModal = useCallback(() => {
    cleanupCapture()
    setError(null)
    setUploadProgress(0)
    setPhase(PHASE.CHECKING)
  }, [cleanupCapture])

  const handleClose = useCallback(() => {
    if (phase === PHASE.UPLOADING) return
    resetModal()
    onClose()
  }, [onClose, phase, resetModal])

  const finalizeRecording = useCallback(() => {
    const blob = new Blob(chunksRef.current, {
      type: mimeTypeRef.current || 'video/webm',
    })
    if (!blob.size) {
      setError(t('recorder.emptyRecording'))
      setPhase(PHASE.ERROR)
      cleanupCapture()
      return
    }
    stopMediaStream(streamRef.current)
    streamRef.current = null
    if (liveVideoRef.current) liveVideoRef.current.srcObject = null
    const url = URL.createObjectURL(blob)
    previewUrlRef.current = url
    setRecordedBlob(blob)
    setPreviewUrl(url)
    setPhase(PHASE.PREVIEW)
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [cleanupCapture, t])

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') return
    recorder.stop()
  }, [])

  const startCapture = useCallback(async () => {
    if (!isScreenRecordingSupported()) {
      setError(t('recorder.httpsRequired'))
      setPhase(PHASE.ERROR)
      return
    }

    cleanupCapture()
    setError(null)
    setPhase(PHASE.PICKING)

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      })
      streamRef.current = stream
      chunksRef.current = []

      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = stream
        liveVideoRef.current.muted = true
        liveVideoRef.current.play().catch(() => {})
      }

      const mimeType = pickRecorderMimeType()
      mimeTypeRef.current = mimeType
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)
      recorderRef.current = recorder

      recorder.ondataavailable = (event) => {
        if (event.data?.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onstop = finalizeRecording
      recorder.onerror = () => {
        setError(t('recorder.recordingError'))
        setPhase(PHASE.ERROR)
        cleanupCapture()
      }

      const videoTrack = stream.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.onended = () => {
          if (recorderRef.current?.state === 'recording') stopRecording()
        }
      }

      recorder.start(1000)
      startedAtRef.current = Date.now()
      setElapsed(0)
      setPhase(PHASE.RECORDING)
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000))
      }, 500)
    } catch (err) {
      if (err?.name === 'NotAllowedError') {
        onClose()
        resetModal()
        return
      }
      setError(recordingErrorMessage(err))
      setPhase(PHASE.ERROR)
      cleanupCapture()
    }
  }, [cleanupCapture, finalizeRecording, onClose, resetModal, stopRecording, t])

  useEffect(() => {
    if (!open) return undefined
    resetModal()
    startCapture()
    return () => cleanupCapture()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once when opened
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape' && phase !== PHASE.UPLOADING) handleClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, phase, handleClose])

  const handleRetake = () => {
    cleanupCapture()
    startCapture()
  }

  const handleConfirmUpload = async () => {
    if (!recordedBlob || !onUpload) return
    const file = blobToRecordingFile(recordedBlob, mimeTypeRef.current)
    setPhase(PHASE.UPLOADING)
    setUploadProgress(0)
    setError(null)
    try {
      await onUpload(file, setUploadProgress)
      resetModal()
      onClose()
    } catch (err) {
      setError(err?.message || t('recorder.uploadError'))
      setPhase(PHASE.PREVIEW)
    }
  }

  const titleByPhase = useMemo(() => ({
    [PHASE.PICKING]: t('recorder.phases.picking'),
    [PHASE.RECORDING]: t('recorder.phases.recording'),
    [PHASE.PREVIEW]: t('recorder.phases.preview'),
    [PHASE.UPLOADING]: t('recorder.phases.uploading'),
    [PHASE.ERROR]: t('recorder.phases.error'),
    [PHASE.CHECKING]: t('recorder.phases.checking'),
  }), [t])

  if (!open) return null

  return (
    <div className='fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6'>
      <button
        type='button'
        aria-label={t('common.close')}
        className='absolute inset-0 cursor-pointer bg-ink-900/40 backdrop-blur-[4px] animate-fade-in'
        onClick={phase !== PHASE.UPLOADING ? handleClose : undefined}
      />
      <div
        role='dialog'
        aria-modal='true'
        aria-labelledby='screen-recorder-title'
        className='relative z-10 w-full max-w-[640px] card-paper corner-mark shadow-lift overflow-hidden px-6 py-6 sm:px-8 animate-fade-up'
        onClick={(e) => e.stopPropagation()}
      >
        <div className='flex items-start justify-between gap-4 mb-5'>
          <div>
            <div className='eyebrow'>Step 01 · Record</div>
            <h2
              id='screen-recorder-title'
              className='font-display text-[26px] text-ink-900 mt-1'
            >
              {titleByPhase[phase] || t('recorder.phases.default')}
            </h2>
          </div>
          {phase !== PHASE.UPLOADING && (
            <button
              type='button'
              aria-label={t('common.close')}
              onClick={handleClose}
              className='shrink-0 w-9 h-9 cursor-pointer rounded-full border hairline-strong text-ink-500 hover:text-ink-900 hover:bg-paper-200/80 transition-colors'
            >
              <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.6' strokeLinecap='round'>
                <path d='M18 6L6 18M6 6l12 12' />
              </svg>
            </button>
          )}
        </div>

        {phase === PHASE.PICKING && (
          <div className='py-12 text-center'>
            <span className='inline-block w-8 h-8 rounded-full border-2 border-umber-500/30 border-t-umber-500 animate-spin mb-4' />
            <p className='text-ink-600 text-sm'>{t('recorder.pickHint')}</p>
          </div>
        )}

        {phase === PHASE.RECORDING && (
          <RecordingBody liveVideoRef={liveVideoRef} elapsed={elapsed} onStop={stopRecording} />
        )}

        {phase === PHASE.PREVIEW && previewUrl && (
          <PreviewBody
            previewUrl={previewUrl}
            recordedBlob={recordedBlob}
            elapsed={elapsed}
            error={error}
            onRetake={handleRetake}
            onConfirm={handleConfirmUpload}
          />
        )}

        {phase === PHASE.UPLOADING && (
          <div className='py-10 text-center'>
            <RingProgress value={uploadProgress} />
            <div className='mt-4 font-display text-xl text-ink-900'>{t('recorder.uploadingTitle')}</div>
            <p className='mt-1 font-mono text-[11px] text-ink-400 tracking-wider'>{uploadProgress}%</p>
          </div>
        )}

        {phase === PHASE.ERROR && (
          <div className='space-y-4'>
            <div className='rounded-xl border border-clay-500/25 bg-clay-500/10 px-4 py-3 text-sm text-clay-600'>
              {error}
            </div>
            <div className='flex justify-end gap-2'>
              <button type='button' onClick={handleClose} className='btn-ghost'>{t('common.cancel')}</button>
              <button type='button' onClick={startCapture} className='btn-primary'>{t('recorder.retryPick')}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function RecordingBody({ liveVideoRef, elapsed, onStop }) {
  const { t } = useTranslation()
  return (
    <div className='space-y-4'>
      <div className='relative overflow-hidden rounded-xl border hairline bg-ink-900'>
        <video ref={liveVideoRef} className='w-full max-h-[min(40vh,320px)] object-contain' playsInline />
        <div className='absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-ink-900/70 px-2.5 py-1 text-[11px] text-paper-50'>
          <span className='h-1.5 w-1.5 rounded-full bg-clay-400' />
          {t('recorder.livePreview')}
        </div>
      </div>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='flex items-center gap-2'>
          <span className='relative flex h-2.5 w-2.5'>
            <span className='absolute inline-flex h-full w-full animate-ping rounded-full bg-clay-500 opacity-60' />
            <span className='relative inline-flex h-2.5 w-2.5 rounded-full bg-clay-500' />
          </span>
          <span className='font-mono text-sm text-ink-900 tabular-nums'>{formatRecordingDuration(elapsed)}</span>
          <span className='text-ink-400 text-xs'>{t('recorder.recording')}</span>
        </div>
        <button type='button' onClick={onStop} className='btn-primary'>
          <svg width='12' height='12' viewBox='0 0 24 24' fill='currentColor' aria-hidden>
            <rect x='6' y='6' width='12' height='12' rx='1' />
          </svg>
          <span>{t('recorder.stopRecording')}</span>
        </button>
      </div>
      <p className='text-[12px] text-ink-400 leading-relaxed'>
        {t('recorder.stopNote')}
      </p>
    </div>
  )
}

function PreviewBody({ previewUrl, recordedBlob, elapsed, error, onRetake, onConfirm }) {
  const { t } = useTranslation()
  return (
    <div className='space-y-4'>
      <video
        src={previewUrl}
        controls
        playsInline
        className='w-full rounded-xl border hairline bg-ink-900/5 max-h-[min(52vh,420px)]'
      />
      <div className='flex flex-wrap gap-4 text-[12px] text-ink-500'>
        <span>{t('recorder.duration', { duration: formatRecordingDuration(elapsed) })}</span>
        <span>{t('recorder.size', { size: formatRecordingSize(recordedBlob?.size) })}</span>
        <span>{t('recorder.formatNote')}</span>
      </div>
      {error && (
        <div className='rounded-xl border border-clay-500/25 bg-clay-500/10 px-4 py-3 text-sm text-clay-600'>
          {error}
        </div>
      )}
      <div className='flex flex-wrap justify-end gap-2 pt-1'>
        <button type='button' onClick={onRetake} className='btn-ghost'>{t('recorder.retake')}</button>
        <button type='button' onClick={onConfirm} className='btn-primary min-w-[140px] justify-center'>
          {t('recorder.useVideo')}
        </button>
      </div>
    </div>
  )
}

function RingProgress({ value }) {
  const c = 2 * Math.PI * 26
  const offset = c - (c * value) / 100
  return (
    <svg width='68' height='68' viewBox='0 0 72 72' className='mx-auto'>
      <circle cx='36' cy='36' r='26' stroke='rgba(31,28,24,0.08)' strokeWidth='2' fill='none' />
      <circle
        cx='36'
        cy='36'
        r='26'
        stroke='var(--umber-500)'
        strokeWidth='2'
        fill='none'
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap='round'
        transform='rotate(-90 36 36)'
        style={{ transition: 'stroke-dashoffset 400ms ease' }}
      />
    </svg>
  )
}
