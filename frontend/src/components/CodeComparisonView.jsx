import { useState, useEffect, useRef, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import useAppStore from '../store/useAppStore.js'
import { regenerateSkill, acceptCandidate, discardCandidate, fetchSkillVersions } from '../api/client.js'
import PromptTemplateSelector from './PromptTemplateSelector.jsx'
import AppSelect from './AppSelect.jsx'

export default function CodeComparisonView({ onClose }) {
  const { t } = useTranslation()
  const store = useAppStore()
  const {
    skillId,
    skillName,
    skillFiles,
    frames,
    requirement,
    regeneration,
    setAdditionalPrompt,
    startRegeneration,
    setRegenerationCandidate,
    acceptCandidate: acceptCandidateAction,
    discardCandidate: discardCandidateAction,
    setShowComparison,
    closeRegenerationPanel,
  } = store

  const [activeFile, setActiveFile] = useState('scripts/main.js')
  const [historyVersions, setHistoryVersions] = useState([])
  const [showHistory, setShowHistory] = useState(false)
  const [isAccepting, setIsAccepting] = useState(false)
  const [isDiscarding, setIsDiscarding] = useState(false)
  const [regenError, setRegenError] = useState(null)

  const { candidate, history, iteration, additionalPrompt, isRegenerating } = regeneration

  // 加载历史版本
  useEffect(() => {
    if (skillId) {
      loadHistory()
    }
  }, [skillId])

  const loadHistory = async () => {
    try {
      const versions = await fetchSkillVersions(skillId)
      setHistoryVersions(versions || [])
    } catch (e) {
      console.error('Failed to load versions:', e)
    }
  }

  // 获取当前和候选的文件内容
  const currentFile = skillFiles.find(f => f.path === activeFile)
  const candidateFile = candidate?.files?.find(f => f.path === activeFile)

  // 获取所有可用的文件路径（合并当前和候选的）
  const allFilePaths = [...new Set([
    ...skillFiles.map(f => f.path),
    ...(candidate?.files?.map(f => f.path) || [])
  ])].filter(path => path.endsWith('.js') || path.endsWith('.md') || path.endsWith('.json'))

  const fileSelectOptions = useMemo(
    () => allFilePaths.map(path => ({ value: path, label: path })),
    [allFilePaths],
  )

  // 执行重新生成
  const handleRegenerate = async () => {
    if (!skillId) return
    
    setRegenError(null)
    startRegeneration()
    
    try {
      // 建立 SSE 连接
      const sessionId = `regen-${Date.now()}`
      const eventSource = new EventSource(`/api/skills/logs/${sessionId}`)
      
      eventSource.onmessage = (event) => {
        console.log('[SSE]', event.data)
      }
      
      eventSource.onerror = () => {
        eventSource.close()
      }

      // 准备帧数据
      const framesData = frames.map(f => ({
        frameId: f.frameId,
        timestamp: f.timestamp,
        base64Image: f.base64Image,
        description: f.description,
        annotationJson: f.annotationJson
      }))

      // 调用 API
      const response = await regenerateSkill(skillId, {
        sessionId,
        requirement,
        additionalPrompt,
        frames: framesData
      })

      eventSource.close()

      // 更新状态
      setRegenerationCandidate(
        response.candidate,
        response.history,
        response.iteration
      )
      
      // 更新本地历史显示
      setHistoryVersions(response.history)
    } catch (e) {
      console.error('Regeneration failed:', e)
      setRegenError(e.message || t('regenerate.regenerateFailed'))
    }
  }

  // 接受候选
  const handleAccept = async () => {
    if (!skillId || !candidate) return
    
    setIsAccepting(true)
    try {
      await acceptCandidate(skillId)
      acceptCandidateAction()
      if (onClose) onClose()
      else closeRegenerationPanel()
    } catch (e) {
      alert(t('regenerate.acceptFailed', { message: e.message }))
    } finally {
      setIsAccepting(false)
    }
  }

  // 放弃候选
  const handleDiscard = async () => {
    if (!skillId) return
    
    setIsDiscarding(true)
    try {
      await discardCandidate(skillId)
      discardCandidateAction()
      if (onClose) onClose()
    } catch (e) {
      alert(t('regenerate.discardFailed', { message: e.message }))
    } finally {
      setIsDiscarding(false)
    }
  }

  // 如果没有候选代码，显示重新生成面板
  if (!candidate) {
    return (
      <div className="bg-slate-800/50 rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-slate-400 text-xs uppercase tracking-wider">🔄 {t('regenerate.regenerate')}</h3>
          <button
            onClick={closeRegenerationPanel}
            className="text-slate-500 hover:text-slate-300"
          >
            ✕
          </button>
        </div>

        {/* 原始诉求 */}
        <div className="space-y-1">
          <label className="text-xs text-slate-500">{t('regenerate.originalRequirement')}</label>
          <div className="bg-slate-900/50 rounded-lg p-2 text-sm text-slate-400 line-clamp-2">
            {requirement || t('regenerate.noRequirement')}
          </div>
        </div>

        {/* 补充要求输入 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs text-slate-500">{t('regenerate.additionalRequirement')}</label>
          </div>
          
          <textarea
            value={additionalPrompt}
            onChange={(e) => setAdditionalPrompt(e.target.value)}
            placeholder={t('regenerate.placeholder')}
            className="w-full h-24 bg-slate-900/50 border border-slate-700 rounded-lg p-3 
                     text-sm text-slate-300 placeholder-slate-600 resize-none
                     focus:outline-none focus:border-blue-500"
          />
          
          <PromptTemplateSelector
            value={additionalPrompt}
            onChange={setAdditionalPrompt}
          />
        </div>

        {/* 帧信息 */}
        <div className="space-y-2 py-2 border-t border-slate-700/50">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">
              🖼️ {t('regenerate.usingFrames', { count: frames.length })}
            </span>
          </div>
          
          {/* 帧缩略图预览 */}
          {frames.length > 0 && (
            <div className="grid grid-cols-6 gap-1.5 max-h-24 overflow-y-auto scrollbar-thin">
              {frames.map((frame, index) => (
                <div
                  key={frame.frameId || index}
                  className="relative aspect-video bg-slate-900 rounded overflow-hidden group"
                  title={frame.description || `${t('regenerate.frameAlt', { n: index + 1 })} @ ${formatTime(frame.timestamp)}`}
                >
                  {frame.base64Image ? (
                    <img
                      src={frame.base64Image.startsWith('data:') ? frame.base64Image : `data:image/jpeg;base64,${frame.base64Image}`}
                      alt={t('regenerate.frameAlt', { n: index + 1 })}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-600">
                      🖼️
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-[8px] text-white text-center py-0.5">
                    {formatTime(frame.timestamp)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {regenError && (
          <div className="text-xs text-red-400 bg-red-900/20 rounded-lg p-2">
            ❌ {regenError}
          </div>
        )}

        {/* 操作按钮 */}
        <div className="flex gap-2">
          <button
            onClick={closeRegenerationPanel}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-lg"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleRegenerate}
            disabled={isRegenerating || !additionalPrompt.trim()}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 
                     text-white text-sm rounded-lg flex items-center justify-center gap-2"
          >
            {isRegenerating ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {t('regenerate.generating')}
              </>
            ) : (
              <>
                <span>🔄</span>
                {t('regenerate.regenerate')}
              </>
            )}
          </button>
        </div>
      </div>
    )
  }

  // 有候选代码，显示对比视图
  return (
    <div className="bg-slate-800/50 rounded-xl overflow-hidden">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50">
        <div className="flex items-center gap-3">
          <h3 className="text-slate-400 text-xs uppercase tracking-wider">
            {t('regenerate.compareTitle', { n: iteration })}
          </h3>
          
          {/* 文件选择器 */}
          <AppSelect
            value={activeFile}
            onChange={setActiveFile}
            options={fileSelectOptions}
            variant='dark'
            size='sm'
            className='min-w-[10rem] max-w-[14rem]'
            aria-label={t('regenerate.compareFiles')}
          />
        </div>

        <div className="flex items-center gap-2">
          {/* 历史版本按钮 */}
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="px-2 py-1 text-xs text-slate-400 hover:text-slate-300 bg-slate-700/50 rounded"
          >
            📚 {t('regenerate.historyVersions')}
          </button>
          
          <button
            onClick={() => setShowComparison(false)}
            className="text-slate-500 hover:text-slate-300"
          >
            ✕
          </button>
        </div>
      </div>

      {/* 关联帧预览 */}
      {frames.length > 0 && (
        <div className="px-4 py-2 bg-slate-900/30 border-b border-slate-700/50">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-slate-500">🖼️ {t('regenerate.relatedFrames', { count: frames.length })}</span>
          </div>
          <div className="flex gap-1.5 overflow-x-auto scrollbar-thin pb-1">
            {frames.map((frame, index) => (
              <div
                key={frame.frameId || index}
                className="relative w-16 h-10 bg-slate-800 rounded overflow-hidden flex-shrink-0"
                title={frame.description || t('regenerate.frameAlt', { n: index + 1 })}
              >
                {frame.base64Image ? (
                  <img
                    src={frame.base64Image.startsWith('data:') ? frame.base64Image : `data:image/jpeg;base64,${frame.base64Image}`}
                    alt={t('regenerate.frameAlt', { n: index + 1 })}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[8px] text-slate-600">
                    🖼️
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 历史版本下拉 */}
      {showHistory && (
        <div className="px-4 py-2 bg-slate-900/30 border-b border-slate-700/50">
          <div className="text-xs text-slate-500 mb-2">{t('regenerate.restoreHistory')}</div>
          <div className="flex gap-2">
            {historyVersions.length === 0 ? (
              <span className="text-xs text-slate-600">{t('regenerate.noHistory')}</span>
            ) : (
              historyVersions.map(v => (
                <div
                  key={v.versionNumber}
                  className="px-2 py-1 bg-slate-800 rounded text-xs text-slate-400"
                  title={v.additionalPrompt}
                >
                  V{v.versionNumber} · {v.acceptedAt?.slice(0, 10)}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* 对比区域 */}
      <div className="grid grid-cols-2 divide-x divide-slate-700/50">
        {/* 左侧：当前生效 */}
        <div className="flex flex-col min-h-[300px] max-h-[500px]">
          <div className="px-3 py-2 bg-slate-900/30 border-b border-slate-700/50">
            <span className="text-xs font-medium text-slate-400">
              {t('regenerate.currentActive')} {iteration > 1 ? `(V${iteration - 1})` : ''}
            </span>
          </div>
          <div className="flex-1 overflow-auto p-3">
            {currentFile ? (
              <pre className="text-xs font-mono text-slate-400 whitespace-pre-wrap">
                {currentFile.content}
              </pre>
            ) : (
              <div className="text-xs text-slate-600">{t('regenerate.fileMissing')}</div>
            )}
          </div>
        </div>

        {/* 右侧：候选 */}
        <div className="flex flex-col min-h-[300px] max-h-[500px]">
          <div className="px-3 py-2 bg-blue-900/20 border-b border-slate-700/50">
            <span className="text-xs font-medium text-blue-400">
              {t('regenerate.candidate', { n: iteration })}
            </span>
            {candidate?.skillName !== skillName && (
              <span className="ml-2 text-xs text-slate-500">
                {candidate?.skillName}
              </span>
            )}
          </div>
          <div className="flex-1 overflow-auto p-3">
            {candidateFile ? (
              <pre className="text-xs font-mono text-slate-300 whitespace-pre-wrap">
                {candidateFile.content}
              </pre>
            ) : (
              <div className="text-xs text-slate-600">{t('regenerate.fileMissing')}</div>
            )}
          </div>
        </div>
      </div>

      {/* 底部操作栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700/50 bg-slate-900/30">
        <div className="flex gap-2">
          <button
            onClick={handleDiscard}
            disabled={isDiscarding}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 
                     text-slate-300 text-sm rounded-lg"
          >
            {isDiscarding ? t('regenerate.processing') : t('regenerate.discard')}
          </button>
          
          <button
            onClick={() => {
              discardCandidateAction()
              // 重新打开编辑面板
            }}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-lg"
          >
            📝 {t('regenerate.editRequirement')}
          </button>
        </div>

        <button
          onClick={handleAccept}
          disabled={isAccepting}
          className="px-6 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 
                   text-white text-sm rounded-lg flex items-center gap-2"
        >
          {isAccepting ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              {t('regenerate.processing')}
            </>
          ) : (
            <>
              <span>✓</span>
              {t('regenerate.accept', { n: iteration })}
            </>
          )}
        </button>
      </div>
    </div>
  )
}

function formatTime(seconds) {
  if (!seconds && seconds !== 0) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}
