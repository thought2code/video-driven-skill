import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import useAppStore from '../store/useAppStore.js'
import { generateSkill } from '../api/client.js'
import {
  AI_PROVIDER_STORAGE_KEY,
  findAiProvider,
  getAiProviders,
  providerHasModel,
  resolveInitialAiSelection,
} from '../config/aiProviders.js'

const fieldBase =
  'w-full rounded-xl border border-ink-900/10 bg-paper-50 px-3 py-2 text-xs text-ink-900 outline-none transition-colors placeholder:text-ink-400 focus:border-umber-400'

const selectFieldClass = `${fieldBase} font-sans`

const inputFieldClass = `${fieldBase} font-mono`

export default function AIProcessor() {
  const { t, i18n } = useTranslation()
  const isZh = i18n.language?.startsWith('zh')
  const providers = useMemo(() => getAiProviders(isZh), [isZh])

  const videoId = useAppStore(s => s.videoId)
  const frames = useAppStore(s => s.frames)
  const requirement = useAppStore(s => s.requirement)
  const isGenerating = useAppStore(s => s.isGenerating)
  const setIsGenerating = useAppStore(s => s.setIsGenerating)
  const setSkill = useAppStore(s => s.setSkill)
  const setActiveTab = useAppStore(s => s.setActiveTab)

  const [logs, setLogs] = useState([])
  const [error, setError] = useState(null)
  const [showModelConfig, setShowModelConfig] = useState(false)
  const [providerId, setProviderId] = useState('server')
  const [aiBaseUrl, setAiBaseUrl] = useState('')
  const [aiModel, setAiModel] = useState('')
  const [aiApiKey, setAiApiKey] = useState('')
  const esRef = useRef(null)
  const hydratedRef = useRef(false)

  const activeProvider = findAiProvider(providers, providerId)
  const isServer = providerId === 'server'
  const isCustom = activeProvider?.isCustom === true

  const configSummary = useMemo(() => {
    if (isServer) return t('aiProcessor.defaultModel')
    if (!activeProvider) return t('aiProcessor.defaultModel')
    const providerName = t(activeProvider.nameKey)
    if (isCustom) {
      const model = aiModel.trim() || '—'
      return `${providerName} · ${model}`
    }
    const modelDef = activeProvider.models.find(m => m.id === aiModel)
    const modelName = modelDef ? t(modelDef.labelKey) : aiModel || '—'
    return `${providerName} · ${modelName}`
  }, [activeProvider, aiModel, isCustom, isServer, t])

  const canGenerate = frames.length > 0 && requirement.trim().length > 0 && !isGenerating

  useEffect(() => {
    const savedProviderId = localStorage.getItem(AI_PROVIDER_STORAGE_KEY) || ''
    const savedBaseUrl = localStorage.getItem('vds.aiBaseUrl') || ''
    const savedModel = localStorage.getItem('vds.aiModel') || ''
    const initial = resolveInitialAiSelection(providers, savedProviderId, savedBaseUrl, savedModel)
    setProviderId(initial.providerId)
    setAiBaseUrl(initial.baseUrl)
    setAiModel(initial.model)
    hydratedRef.current = true
  }, [providers])

  useEffect(() => {
    if (!hydratedRef.current) return
    localStorage.setItem(AI_PROVIDER_STORAGE_KEY, providerId)
    if (isServer) {
      localStorage.removeItem('vds.aiBaseUrl')
      localStorage.removeItem('vds.aiModel')
      return
    }
    if (aiBaseUrl.trim()) localStorage.setItem('vds.aiBaseUrl', aiBaseUrl.trim())
    else localStorage.removeItem('vds.aiBaseUrl')
    if (aiModel.trim()) localStorage.setItem('vds.aiModel', aiModel.trim())
    else localStorage.removeItem('vds.aiModel')
  }, [providerId, aiBaseUrl, aiModel, isServer])

  const applyProvider = (nextId) => {
    const next = findAiProvider(providers, nextId)
    if (!next) return
    setProviderId(nextId)
    if (nextId === 'server') {
      setAiBaseUrl('')
      setAiModel('')
    } else if (next.isCustom) {
      setAiBaseUrl(prev => prev || localStorage.getItem('vds.aiBaseUrl') || '')
      setAiModel(prev => prev || localStorage.getItem('vds.aiModel') || '')
    } else {
      setAiBaseUrl(next.baseUrl)
      const saved = localStorage.getItem('vds.aiModel') || ''
      setAiModel(saved && providerHasModel(next, saved) ? saved : next.models[0]?.id || '')
    }
  }

  const handleGenerate = async () => {
    if (!canGenerate) return
    setError(null)
    setLogs([])
    setIsGenerating(true)

    const sessionId = crypto.randomUUID()

    await new Promise((resolve) => {
      const es = new EventSource(`/api/skills/logs/${sessionId}`)
      esRef.current = es

      es.onopen = () => resolve()

      es.onmessage = (e) => {
        setLogs(prev => [...prev, e.data])
      }

      es.onerror = () => {
        es.close()
        resolve()
      }

      setTimeout(resolve, 500)
    })

    try {
      const skill = await generateSkill({
        videoId,
        requirement,
        sessionId,
        aiConfig: {
          baseUrl: isServer ? '' : aiBaseUrl.trim(),
          model: isServer ? '' : aiModel.trim(),
          apiKey: aiApiKey.trim(),
        },
        frames: frames.map(f => ({
          frameId: f.frameId,
          timestamp: f.timestamp,
          base64Image: f.base64Image,
          description: f.description || '',
          annotationJson: f.annotationJson || '',
        })),
      })
      setSkill(skill.skillId, skill.skillName, skill.files, skill.variables)
      setActiveTab('skill')
    } catch (e) {
      setError(e.message)
    } finally {
      setIsGenerating(false)
      if (esRef.current) {
        esRef.current.close()
        esRef.current = null
      }
    }
  }

  return (
    <div className='space-y-3'>
      <div className='rounded-2xl border border-ink-900/8 bg-paper-100/60 p-3'>
        <button
          type='button'
          onClick={() => setShowModelConfig(v => !v)}
          className='flex w-full items-center justify-between text-left'
        >
          <span>
            <span className='eyebrow block'>{t('aiProcessor.visionConfig')}</span>
            <span className='mt-1 block text-xs text-ink-400'>{configSummary}</span>
          </span>
          <span className='rounded-full border border-ink-900/10 px-2.5 py-1 text-xs text-ink-500'>
            {showModelConfig ? t('aiProcessor.collapse') : t('aiProcessor.configure')}
          </span>
        </button>

        {showModelConfig && (
          <div className='mt-3 space-y-3 border-t border-ink-900/8 pt-3'>
            <label className='block'>
              <span className='mb-1 block text-xs text-ink-500'>{t('aiProcessor.provider')}</span>
              <select
                value={providerId}
                onChange={e => applyProvider(e.target.value)}
                className={selectFieldClass}
              >
                {providers.map(p => (
                  <option key={p.id} value={p.id}>{t(p.nameKey)}</option>
                ))}
              </select>
              {activeProvider?.hintKey && (
                <p className='mt-1.5 text-[11px] leading-relaxed text-ink-400'>
                  {t(activeProvider.hintKey)}
                </p>
              )}
            </label>

            {!isServer && !isCustom && activeProvider && activeProvider.models.length > 0 && (
              <label className='block'>
                <span className='mb-1 block text-xs text-ink-500'>{t('aiProcessor.visionModel')}</span>
                <select
                  value={aiModel}
                  onChange={e => setAiModel(e.target.value)}
                  className={selectFieldClass}
                >
                  {activeProvider.models.map(m => (
                    <option key={m.id} value={m.id}>{t(m.labelKey)}</option>
                  ))}
                </select>
              </label>
            )}

            {isCustom && (
              <>
                <label className='block'>
                  <span className='mb-1 block text-xs text-ink-500'>{t('aiProcessor.customBaseUrl')}</span>
                  <input
                    value={aiBaseUrl}
                    onChange={e => setAiBaseUrl(e.target.value)}
                    placeholder={t('aiProcessor.customBaseUrlPlaceholder')}
                    className={inputFieldClass}
                  />
                </label>
                <label className='block'>
                  <span className='mb-1 block text-xs text-ink-500'>{t('aiProcessor.customModel')}</span>
                  <input
                    value={aiModel}
                    onChange={e => setAiModel(e.target.value)}
                    placeholder={t('aiProcessor.customModelPlaceholder')}
                    className={inputFieldClass}
                  />
                </label>
              </>
            )}

            {!isServer && (
              <label className='block'>
                <span className='mb-1 flex items-center justify-between gap-2 text-xs text-ink-500'>
                  <span>{t('aiProcessor.apiKey')}</span>
                  {activeProvider?.keyUrl && (
                    <a
                      href={activeProvider.keyUrl}
                      target='_blank'
                      rel='noopener noreferrer'
                      className='font-medium text-umber-600 hover:text-umber-700'
                    >
                      {t('aiProcessor.getApiKey')}
                    </a>
                  )}
                </span>
                <input
                  value={aiApiKey}
                  onChange={e => setAiApiKey(e.target.value)}
                  placeholder={t('aiProcessor.apiKeyPlaceholder')}
                  type='password'
                  autoComplete='off'
                  className={inputFieldClass}
                />
              </label>
            )}

            <p className='text-[11px] leading-relaxed text-ink-400'>
              {t('aiProcessor.configNote')}
            </p>
          </div>
        )}
      </div>

      <button
        onClick={handleGenerate}
        disabled={!canGenerate}
        className={`w-full rounded-2xl py-3.5 text-base font-semibold transition-all
          ${canGenerate
            ? 'cursor-pointer bg-ink-900 text-paper-50 shadow-soft hover:-translate-y-0.5 hover:bg-umber-600 hover:shadow-ember-glow'
            : 'cursor-not-allowed bg-paper-200/70 text-ink-400'}`}
      >
        {isGenerating ? (
          <span className='flex items-center justify-center gap-2'>
            <span className='w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin' />
            {t('aiProcessor.analyzing')}
          </span>
        ) : t('aiProcessor.generateSkill')}
      </button>

      {!frames.length && (
        <p className='text-center text-xs text-ink-400'>{t('aiProcessor.needFrames')}</p>
      )}
      {frames.length > 0 && !requirement.trim() && (
        <p className='text-center text-xs text-ink-400'>{t('aiProcessor.needRequirement')}</p>
      )}

      {(logs.length > 0 || isGenerating) && (
        <div className='max-h-48 space-y-1 overflow-y-auto rounded-2xl border border-ink-900/10 bg-ink-900 p-3'>
          {logs.map((line, i) => (
            <div key={i} className='font-mono text-xs leading-relaxed text-paper-200'>
              {line}
            </div>
          ))}
          {isGenerating && (
            <div className='font-mono text-xs text-paper-400 animate-pulse'>▌</div>
          )}
        </div>
      )}

      {error && (
        <div className='rounded-xl border border-clay-500/30 bg-clay-500/10 px-3 py-2 text-sm text-clay-700'>
          {error}
        </div>
      )}
    </div>
  )
}
