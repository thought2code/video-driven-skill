import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import useAppStore from '../store/useAppStore.js'
import { fetchAndroidDevices, fetchIosDevices, killAllMidsceneProcesses } from '../api/client.js'
import {
  Play, Square, RefreshCw, FlaskConical, AlertTriangle, Check, AlertCircle,
  Skull, Trash2, Clipboard, FileText, BarChart3, Loader2, Save, RotateCcw, Timer
} from 'lucide-react'
import AppSelect from './AppSelect.jsx'

const PLATFORMS = ['browser', 'android', 'ios', 'computer']
const DEFAULT_TIMEOUT = 600
const CONFIG_KEY_PREFIX = 'video-driven-skill:runner-config:'

export default function SkillRunner() {
  const { t } = useTranslation()
  const skillId = useAppStore(s => s.skillId)
  const skillFiles = useAppStore(s => s.skillFiles)
  const skillVariables = useAppStore(s => s.skillVariables)

  const [isRunning, setIsRunning] = useState(false)
  const [logs, setLogs] = useState([])
  const [screenshots, setScreenshots] = useState([])
  const [result, setResult] = useState(null)
  const [activeTab, setActiveTab] = useState('logs')

  const [targetUrl, setTargetUrl] = useState('')
  const [headless, setHeadless] = useState(false)
  const [platform, setPlatform] = useState('browser')
  const [deviceId, setDeviceId] = useState('')

  const [variableValues, setVariableValues] = useState({})
  const [timeoutSeconds, setTimeoutSeconds] = useState(DEFAULT_TIMEOUT)
  const [androidDevices, setAndroidDevices] = useState([])
  const [iosDevices, setIosDevices] = useState([])
  const [loadingDevices, setLoadingDevices] = useState(false)
  const [savedHint, setSavedHint] = useState('')

  const wsRef = useRef(null)
  const logsContainerRef = useRef(null)

  useEffect(() => {
    const el = logsContainerRef.current
    if (!el) return
    // 仅当用户已贴在容器底部附近时才跟随，避免打断阅读 & 防止页面整体被滚动
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    if (distanceFromBottom < 80) {
      el.scrollTop = el.scrollHeight
    }
  }, [logs])

  useEffect(() => {
    return () => { if (wsRef.current) wsRef.current.close() }
  }, [])

  useEffect(() => {
    if (platform === 'android') loadAndroidDevices()
    else if (platform === 'ios') loadIosDevices()
  }, [platform])

  // 单一权威初始化：每个 skillId 仅执行一次（用 ref 锁定），stored 严格优先于自动检测
  const initializedSkillIdRef = useRef(null)
  useEffect(() => {
    if (!skillId || initializedSkillIdRef.current === skillId) return
    // 等到 skillFiles/skillVariables 都到齐再初始化，避免空 package.json 检测失败
    if (!skillFiles || skillFiles.length === 0) return
    initializedSkillIdRef.current = skillId

    let saved = null
    try { saved = JSON.parse(localStorage.getItem(CONFIG_KEY_PREFIX + skillId) || 'null') } catch { /* ignore */ }

    // Platform：本地保存优先，否则从 package.json 推断
    if (saved && saved.platform) {
      setPlatform(saved.platform)
    } else {
      const pkg = skillFiles.find(f => f.name === 'package.json')
      if (pkg) {
        let detected = 'browser'
        if (pkg.content.includes('@midscene/android')) detected = 'android'
        else if (pkg.content.includes('@midscene/ios')) detected = 'ios'
        else if (pkg.content.includes('@midscene/computer')) detected = 'computer'
        setPlatform(detected)
      }
    }

    setTargetUrl(saved?.targetUrl ?? '')
    setHeadless(saved?.headless ?? false)
    setDeviceId(saved?.deviceId ?? '')
    setTimeoutSeconds(saved?.timeoutSeconds ?? DEFAULT_TIMEOUT)

    // Variables：先 skill 自带 defaultValue，再用本地保存覆盖。
    // 旧版本可能把空默认值保存进 localStorage；当 Skill 后端补齐了非空默认值时，
    // 不让历史空值继续遮住新解析出来的默认值。
    const merged = {}
    if (skillVariables) skillVariables.forEach(v => { merged[v.name] = v.defaultValue || '' })
    if (saved?.variableValues) {
      Object.entries(saved.variableValues).forEach(([name, value]) => {
        const skillDefault = skillVariables?.find(v => v.name === name)?.defaultValue || ''
        if (value !== '' || !skillDefault) {
          merged[name] = value
        }
      })
    }
    setVariableValues(merged)
  }, [skillId, skillFiles, skillVariables])

  // 重新生成后 skillVariables 可能新增字段：补齐新变量的默认值，不动用户已有输入
  useEffect(() => {
    if (!skillVariables || skillVariables.length === 0) return
    setVariableValues(prev => {
      const next = { ...prev }
      let changed = false
      skillVariables.forEach(v => {
        if (next[v.name] === undefined) {
          next[v.name] = v.defaultValue || ''
          changed = true
        }
      })
      return changed ? next : prev
    })
  }, [skillVariables])

  const saveDefaults = () => {
    if (!skillId) return
    const config = { platform, targetUrl, headless, deviceId, timeoutSeconds, variableValues }
    localStorage.setItem(CONFIG_KEY_PREFIX + skillId, JSON.stringify(config))
    setSavedHint(t('skillRunner.saved'))
    setTimeout(() => setSavedHint(''), 1500)
  }

  const resetDefaults = () => {
    if (!skillId) return
    if (!confirm(t('skillRunner.resetConfirm'))) return
    localStorage.removeItem(CONFIG_KEY_PREFIX + skillId)
    setTargetUrl('')
    setHeadless(false)
    setTimeoutSeconds(DEFAULT_TIMEOUT)
    setDeviceId('')
    if (skillVariables) {
      const defaults = {}
      skillVariables.forEach(v => { defaults[v.name] = v.defaultValue || '' })
      setVariableValues(defaults)
    }
    // 允许下一次该 skill 的 init effect 重新走一次（重新做平台自动检测等）
    initializedSkillIdRef.current = null
    setSavedHint(t('skillRunner.reset'))
    setTimeout(() => setSavedHint(''), 1500)
  }

  const loadAndroidDevices = async () => {
    setLoadingDevices(true)
    try {
      const devices = await fetchAndroidDevices()
      setAndroidDevices(devices || [])
      if (devices && devices.length > 0 && !deviceId) setDeviceId(devices[0].id)
    } catch (e) {
      console.error('Failed to load android devices:', e)
      setAndroidDevices([])
    } finally { setLoadingDevices(false) }
  }

  const loadIosDevices = async () => {
    setLoadingDevices(true)
    try {
      const devices = await fetchIosDevices()
      setIosDevices(devices || [])
      if (devices && devices.length > 0 && !deviceId) setDeviceId(devices[0].id)
    } catch (e) {
      console.error('Failed to load iOS devices:', e)
      setIosDevices([])
    } finally { setLoadingDevices(false) }
  }

  const handleRun = () => {
    if (!skillId) return
    if ((platform === 'android' || platform === 'ios') && !deviceId) {
      setLogs(prev => [...prev, { type: 'error', message: t('skillRunner.selectDevice') }])
      return
    }

    setIsRunning(true); setLogs([]); setScreenshots([]); setResult(null); setActiveTab('logs')
    setLogs(prev => [...prev, { type: 'info', message: t('skillRunner.connecting') }])

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${wsProtocol}//${window.location.host}/ws/skill-run`
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      setLogs(prev => [...prev, { type: 'info', message: t('skillRunner.connected') }])
      ws.send(JSON.stringify({
        action: 'run', skillId, platform,
        targetUrl: targetUrl || undefined,
        deviceId: deviceId || undefined,
        headless, variables: variableValues,
        timeoutSeconds: Number(timeoutSeconds) > 0 ? Number(timeoutSeconds) : undefined
      }))
    }

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      switch (data.type) {
        case 'connected':
        case 'started':
          setLogs(prev => [...prev, { type: 'info', message: data.message }]); break
        case 'log': {
          const logMessage = data.message || data.log || JSON.stringify(data)
          setLogs(prev => [...prev, { type: 'log', message: logMessage }]); break
        }
        case 'completed':
          setIsRunning(false); setResult(data)
          if (data.screenshots) setScreenshots(data.screenshots)
          setLogs(prev => [...prev, {
            type: data.success ? 'success' : 'error',
            message: t('skillRunner.duration', {
              message: data.message,
              seconds: (data.durationMs / 1000).toFixed(1),
            })
          }])
          ws.close(); break
        case 'error':
          setIsRunning(false)
          setLogs(prev => [...prev, { type: 'error', message: data.message }])
          ws.close(); break
        case 'stopped':
          setIsRunning(false)
          setLogs(prev => [...prev, { type: 'warning', message: data.message }])
          ws.close(); break
      }
    }

    ws.onerror = () => {
      setLogs(prev => [...prev, { type: 'error', message: t('skillRunner.wsError') }])
      setIsRunning(false)
    }
  }

  const handleStop = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'stop' }))
    }
  }

  const handleKillAll = async () => {
    if (!confirm(t('skillRunner.killConfirm'))) return
    setLogs(prev => [...prev, { type: 'warning', message: t('skillRunner.killing') }])
    try {
      const result = await killAllMidsceneProcesses()
      const killedList = result.killed?.join(', ') || t('common.none')
      setLogs(prev => [...prev,
        { type: 'info', message: t('skillRunner.killed', { list: killedList }) },
        { type: 'info', message: t('skillRunner.cleanedDirs', { count: result.cleanedDirs || 0 }) },
      ])
      if (result.errors && result.errors.length > 0) {
        result.errors.forEach(err => {
          setLogs(prev => [...prev, { type: 'error', message: err }])
        })
      }
      if (isRunning) {
        setIsRunning(false)
        if (wsRef.current) wsRef.current.close()
      }
    } catch (error) {
      setLogs(prev => [...prev, { type: 'error', message: t('skillRunner.killFailed', { message: error.message }) }])
    }
  }

  const clearLogs = () => {
    setLogs([]); setScreenshots([]); setResult(null); setActiveTab('logs')
  }

  const copyLogs = () => {
    const labels = { error: '[ERROR]', success: '[OK]', warning: '[WARN]', info: '[INFO]', log: '[LOG]' }
    const logText = logs.map((log, idx) => `${idx + 1}. ${labels[log.type] || '[LOG]'} ${log.message}`).join('\n')
    navigator.clipboard.writeText(logText).catch(() => {})
  }

  const copyResult = () => {
    if (!result) return
    navigator.clipboard.writeText(JSON.stringify(result, null, 2)).catch(() => {})
  }

  const canRun = () => {
    if (!skillId || isRunning) return false
    if (platform === 'android' || platform === 'ios') return !!deviceId
    return true
  }

  const renderDeviceSelector = () => {
    const devices = platform === 'android' ? androidDevices : iosDevices
    const loader = platform === 'android' ? loadAndroidDevices : loadIosDevices

    if (devices.length === 0) {
      return (
        <div className='flex items-center gap-2 text-[12px] text-umber-600 bg-umber-50/70 border border-umber-300/40 rounded-xl px-3 py-2'>
          <AlertTriangle className='w-3.5 h-3.5' />
          <span>{t('skillRunner.noDevice', { platform: platform === 'android' ? 'Android' : 'iOS' })}</span>
          <button
            onClick={loader}
            disabled={loadingDevices}
            className='ml-auto inline-flex items-center gap-1 text-ink-700 hover:text-ink-900 transition-colors'
          >
            <RefreshCw className={`w-3 h-3 ${loadingDevices ? 'animate-spin' : ''}`} />
            {loadingDevices ? t('common.refreshing') : t('common.refresh')}
          </button>
        </div>
      )
    }

    return (
      <div className='space-y-1.5'>
        <label className='eyebrow flex items-center justify-between'>
          <span>{t('skillRunner.device')}</span>
          <button
            onClick={loader}
            disabled={loadingDevices}
            className='inline-flex items-center gap-1 text-ink-500 hover:text-ink-900 normal-case tracking-normal text-[11px] transition-colors'
          >
            <RefreshCw className={`w-3 h-3 ${loadingDevices ? 'animate-spin' : ''}`} />
            {loadingDevices ? t('common.refreshing') : t('common.refresh')}
          </button>
        </label>
        <AppSelect
          value={deviceId}
          onChange={setDeviceId}
          disabled={isRunning}
          options={devices.map(device => ({
            value: device.id,
            label: `${device.model}${platform === 'android' ? ` (${device.id.substring(0, 8)}…)` : ''}`,
          }))}
          aria-label={t('skillRunner.device')}
        />
        {platform === 'android' && deviceId && (
          <div className='text-[11px] text-ink-400 font-mono tracking-wide'>
            STATE ·{' '}
            <span className={androidDevices.find(d => d.id === deviceId)?.state === 'device' ? 'text-sage-700' : 'text-umber-600'}>
              {androidDevices.find(d => d.id === deviceId)?.state || 'unknown'}
            </span>
          </div>
        )}
      </div>
    )
  }

  const logTone = {
    error:   'bg-clay-500/8 text-clay-700',
    success: 'bg-sage-300/15 text-sage-700',
    warning: 'bg-umber-50/80 text-umber-700',
    info:    'bg-paper-200/50 text-ink-700',
    log:     'text-ink-700',
  }

  return (
    <div className='space-y-4'>
      {/* Configuration */}
      <div className='card-paper p-5 space-y-4'>
        <div className='flex items-center justify-between'>
          <div className='flex items-baseline gap-3'>
            <FlaskConical className='w-4 h-4 text-umber-500 self-center' />
            <div>
              <div className='eyebrow mb-0.5'>{t('skillRunner.runner')}</div>
              <span className='font-display text-[17px] text-ink-900'>{t('skillRunner.runSkill')}</span>
            </div>
          </div>

          {result && (
            <span className={`inline-flex items-center gap-1.5 text-[11.5px] px-2.5 py-1 rounded-full border
              ${result.success
                ? 'bg-sage-300/20 border-sage-500/30 text-sage-700'
                : 'bg-clay-500/10 border-clay-500/25 text-clay-700'}`}>
              {result.success ? <Check className='w-3 h-3' /> : <AlertCircle className='w-3 h-3' />}
              {result.success ? t('skillRunner.success') : t('skillRunner.failed')}
            </span>
          )}
        </div>

        {/* Platform pills */}
        <div className='flex gap-1.5'>
          {PLATFORMS.map(p => (
            <button
              key={p}
              onClick={() => setPlatform(p)}
              disabled={isRunning}
              className={`px-3 py-1.5 rounded-full text-[11.5px] font-mono uppercase tracking-wider transition-all duration-300 border
                ${platform === p
                  ? 'bg-ink-900 text-paper-50 border-ink-900'
                  : 'bg-paper-50 text-ink-500 border-ink-900/10 hover:border-ink-900/25 hover:text-ink-900'}
                disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Variable configuration */}
        {skillVariables && skillVariables.length > 0 && (
          <div className='space-y-2.5 border-t hairline pt-4'>
            <label className='eyebrow'>{t('skillRunner.variables')}</label>
            <div className='space-y-2.5'>
              {skillVariables.map(variable => (
                <div key={variable.name} className='space-y-1'>
                  <label className='text-[12px] text-ink-700'>{variable.label}</label>
                  <input
                    type={variable.type === 'number' ? 'number' : 'text'}
                    value={variableValues[variable.name] || ''}
                    onChange={e => setVariableValues(prev => ({ ...prev, [variable.name]: e.target.value }))}
                    placeholder={t('skillRunner.defaultValue', { value: variable.defaultValue || '' })}
                    disabled={isRunning}
                    className='w-full bg-paper-50 border border-ink-900/10 rounded-xl px-3 py-2 text-[13px] text-ink-900 placeholder:text-ink-400 focus:outline-none focus:border-umber-500 transition-colors disabled:opacity-50'
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Browser config */}
        {platform === 'browser' && (
          <div className='space-y-3 border-t hairline pt-4'>
            <div className='space-y-1.5'>
              <label className='eyebrow'>{t('skillRunner.targetUrl')}</label>
              <input
                type='text'
                value={targetUrl}
                onChange={e => setTargetUrl(e.target.value)}
                placeholder='https://example.com'
                disabled={isRunning}
                className='w-full bg-paper-50 border border-ink-900/10 rounded-xl px-3 py-2 text-[13px] text-ink-900 placeholder:text-ink-400 focus:outline-none focus:border-umber-500 transition-colors disabled:opacity-50'
              />
            </div>

            <label className='flex items-center gap-2 cursor-pointer select-none'>
              <input
                type='checkbox'
                checked={headless}
                onChange={e => setHeadless(e.target.checked)}
                disabled={isRunning}
                className='rounded border-ink-900/20 bg-paper-50 text-umber-600 focus:ring-umber-500 focus:ring-offset-0'
              />
              <span className='text-[13px] text-ink-700'>{t('skillRunner.headless')}</span>
            </label>
          </div>
        )}

        {(platform === 'android' || platform === 'ios') && (
          <div className='border-t hairline pt-4'>{renderDeviceSelector()}</div>
        )}

        {platform === 'computer' && (
          <div className='flex items-start gap-2 text-[12px] text-umber-700 bg-umber-50/70 border border-umber-300/40 rounded-xl px-3 py-2.5 leading-relaxed'>
            <AlertTriangle className='w-3.5 h-3.5 shrink-0 mt-0.5' />
            <span>{t('skillRunner.computerWarning')}</span>
          </div>
        )}

        {/* Timeout & Save defaults */}
        <div className='border-t hairline pt-4 flex flex-wrap items-end gap-3'>
          <div className='space-y-1.5 min-w-[180px]'>
            <label className='eyebrow flex items-center gap-1.5'>
              <Timer className='w-3 h-3' /> {t('skillRunner.timeout')}
            </label>
            <input
              type='number'
              min='30'
              max='3600'
              step='30'
              value={timeoutSeconds}
              onChange={e => setTimeoutSeconds(e.target.value === '' ? '' : Number(e.target.value))}
              disabled={isRunning}
              className='w-full bg-paper-50 border border-ink-900/10 rounded-xl px-3 py-2 text-[13px] text-ink-900 focus:outline-none focus:border-umber-500 transition-colors disabled:opacity-50'
            />
            <span className='text-[11px] text-ink-400'>{t('skillRunner.timeoutRange', { default: DEFAULT_TIMEOUT })}</span>
          </div>
          <div className='flex items-center gap-2 ml-auto'>
            {savedHint && <span className='text-[11.5px] text-sage-700 font-mono tracking-wider'>{savedHint}</span>}
            <button
              onClick={saveDefaults}
              disabled={!skillId || isRunning}
              className='btn-ghost disabled:opacity-40 disabled:cursor-not-allowed'
              title={t('skillRunner.saveDefaultsTitle')}
            >
              <Save className='w-3.5 h-3.5' />
              <span>{t('skillRunner.saveDefaults')}</span>
            </button>
            <button
              onClick={resetDefaults}
              disabled={!skillId || isRunning}
              className='btn-ghost disabled:opacity-40 disabled:cursor-not-allowed'
              title={t('skillRunner.resetDefaultsTitle')}
            >
              <RotateCcw className='w-3.5 h-3.5' />
            </button>
          </div>
        </div>

        {/* Control buttons */}
        <div className='flex gap-2 pt-1'>
          {isRunning ? (
            <button
              onClick={handleStop}
              className='flex-1 btn-primary justify-center bg-clay-500 border-clay-500 hover:bg-clay-700'
            >
              <Square className='w-3.5 h-3.5 fill-current' />
              <span>{t('skillRunner.stopRun')}</span>
            </button>
          ) : (
            <button
              onClick={handleRun}
              disabled={!canRun()}
              className='flex-1 btn-primary justify-center disabled:opacity-40 disabled:cursor-not-allowed'
            >
              <Play className='w-3.5 h-3.5 fill-current' />
              <span>{t('skillRunner.runValidation')}</span>
            </button>
          )}

          <button
            onClick={clearLogs}
            disabled={isRunning || logs.length === 0}
            className='btn-ghost disabled:opacity-40 disabled:cursor-not-allowed'
            title={t('skillRunner.clearLogs')}
          >
            <Trash2 className='w-3.5 h-3.5' />
          </button>

          <button
            onClick={handleKillAll}
            title={t('skillRunner.killMidscene')}
            className='btn-ghost text-clay-700 hover:border-clay-500/40 hover:text-clay-500'
          >
            <Skull className='w-3.5 h-3.5' />
            <span>Kill</span>
          </button>
        </div>

        {!canRun() && !isRunning && (platform === 'android' || platform === 'ios') && (
          <p className='text-[11.5px] text-umber-600 flex items-center gap-1.5'>
            <AlertTriangle className='w-3 h-3' /> {t('skillRunner.connectDeviceFirst')}
          </p>
        )}
      </div>

      {/* Screenshots */}
      {screenshots.length > 0 && (
        <div className='card-paper p-4'>
          <div className='eyebrow mb-3'>{t('skillRunner.screenshots', { count: screenshots.length })}</div>
          <div className='grid grid-cols-2 gap-2 max-h-56 overflow-y-auto scrollbar-thin'>
            {screenshots.map((shot, idx) => (
              <div key={idx} className='relative group rounded-lg overflow-hidden border hairline'>
                <img
                  src={`data:image/png;base64,${shot.base64Image}`}
                  alt={shot.label}
                  className='w-full h-auto'
                />
                <span className='absolute top-1.5 left-1.5 text-[10px] font-mono bg-ink-900/70 text-paper-50 px-1.5 py-0.5 rounded tracking-wide'>
                  {shot.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Logs / Result */}
      {(logs.length > 0 || result) && (
        <div className='card-paper overflow-hidden'>
          <div className='px-4 py-2.5 border-b hairline bg-paper-100/40 flex items-center justify-between'>
            <div className='flex items-center gap-1.5'>
              <button
                onClick={() => setActiveTab('logs')}
                className={`text-[11.5px] font-mono uppercase tracking-wider px-3 py-1.5 rounded-full border transition-all
                  ${activeTab === 'logs'
                    ? 'bg-ink-900 text-paper-50 border-ink-900'
                    : 'bg-paper-50 text-ink-500 border-ink-900/10 hover:text-ink-900'}`}
              >
                <FileText className='w-3 h-3 inline mr-1 -mt-0.5' />
                {t('skillRunner.logs', { count: logs.length })}
              </button>
              {result && (
                <button
                  onClick={() => setActiveTab('result')}
                  className={`text-[11.5px] font-mono uppercase tracking-wider px-3 py-1.5 rounded-full border transition-all
                    ${activeTab === 'result'
                      ? 'bg-ink-900 text-paper-50 border-ink-900'
                      : 'bg-paper-50 text-ink-500 border-ink-900/10 hover:text-ink-900'}`}
                >
                  <BarChart3 className='w-3 h-3 inline mr-1 -mt-0.5' />
                  {t('skillRunner.result')}
                </button>
              )}
            </div>
            <div className='flex items-center gap-2'>
              {activeTab === 'logs' ? (
                <button
                  onClick={copyLogs}
                  className='text-[11px] text-ink-500 hover:text-ink-900 transition-colors flex items-center gap-1'
                  title={t('skillRunner.copyLogs')}
                >
                  <Clipboard className='w-3 h-3' /> {t('common.copy')}
                </button>
              ) : (
                <button
                  onClick={copyResult}
                  className='text-[11px] text-ink-500 hover:text-ink-900 transition-colors flex items-center gap-1'
                  title={t('skillRunner.copyResult')}
                >
                  <Clipboard className='w-3 h-3' /> {t('common.copy')}
                </button>
              )}
              {isRunning && (
                <span className='inline-flex items-center gap-1.5 text-[10.5px] font-mono text-umber-600 tracking-wider'>
                  <span className='w-1.5 h-1.5 bg-umber-500 rounded-full animate-pulse' />
                  LIVE
                </span>
              )}
            </div>
          </div>

          {activeTab === 'logs' && (
            <div ref={logsContainerRef} className='p-3 max-h-80 overflow-y-auto font-mono text-[11.5px] space-y-0.5 scrollbar-thin bg-paper-50'>
              {logs.map((log, idx) => (
                <div
                  key={idx}
                  className={`break-all py-1 px-2 rounded-md leading-relaxed ${logTone[log.type] || logTone.log}`}
                >
                  <span className='text-ink-400 mr-2 select-none tabular-nums'>{String(idx + 1).padStart(2, '0')}</span>
                  {log.message}
                </div>
              ))}
            </div>
          )}

          {activeTab === 'result' && result && (
            <div className='p-4 max-h-96 overflow-y-auto scrollbar-thin'>
              <div className='mb-3 flex items-center justify-between'>
                <span className={`inline-flex items-center gap-1.5 text-[11.5px] px-2.5 py-1 rounded-full border
                  ${result.success
                    ? 'bg-sage-300/20 border-sage-500/30 text-sage-700'
                    : 'bg-clay-500/10 border-clay-500/25 text-clay-700'}`}>
                  {result.success ? <Check className='w-3 h-3' /> : <AlertCircle className='w-3 h-3' />}
                  {result.success ? t('skillRunner.runSuccess') : t('skillRunner.runFailed')}
                </span>
                {result.durationMs && (
                  <span className='font-mono text-[11px] text-ink-400 tracking-wide'>
                    {(result.durationMs / 1000).toFixed(1)}s
                  </span>
                )}
              </div>

              {result.data && (() => {
                try {
                  const data = typeof result.data === 'string' ? JSON.parse(result.data) : result.data
                  const total = data.meta?.totalCollected || data.totalCollected
                  const target = data.meta?.targetCount || data.targetCount
                  const shop = data.meta?.shopName
                  if (!total && !target && !shop) return null
                  return (
                    <div className='mb-3 px-3 py-2.5 bg-paper-100/60 border hairline rounded-xl flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px]'>
                      <span className='eyebrow'>Summary</span>
                      {total != null && (
                        <span className='text-ink-700'>{t('skillRunner.product')} · <span className='font-mono text-sage-700 font-medium'>{total}</span></span>
                      )}
                      {target != null && (
                        <span className='text-ink-700'>{t('skillRunner.target')} · <span className='font-mono text-ink-900'>{target}</span></span>
                      )}
                      {shop && (
                        <span className='text-ink-700'>{t('skillRunner.shop')} · <span className='text-umber-600'>{shop}</span></span>
                      )}
                    </div>
                  )
                } catch { return null }
              })()}

              <div className='eyebrow mb-2'>Raw · JSON</div>
              <pre className='font-mono text-[11.5px] text-ink-700 bg-paper-100/70 border hairline rounded-xl p-3 overflow-x-auto max-h-60 leading-relaxed'>
                {(() => {
                  try {
                    const displayData = result.data
                      ? (typeof result.data === 'string' ? JSON.parse(result.data) : result.data)
                      : result
                    return JSON.stringify(displayData, null, 2)
                  } catch { return JSON.stringify(result, null, 2) }
                })()}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
