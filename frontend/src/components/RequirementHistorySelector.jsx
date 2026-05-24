import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import useAppStore from '../store/useAppStore.js'
import { fetchRecentRequirements, saveRequirement, updateRequirementUseCount } from '../api/client.js'

export default function RequirementHistorySelector() {
  const { t } = useTranslation()
  const requirement = useAppStore(s => s.requirement)
  const setRequirement = useAppStore(s => s.setRequirement)
  const frames = useAppStore(s => s.frames)
  const platform = useAppStore(s => s.skillFiles?.find(f => f.name === 'package.json')?.content?.includes('@midscene/android') ? 'android' : 'browser')

  const [history, setHistory] = useState([])
  const [showSelector, setShowSelector] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadHistory()
  }, [])

  const loadHistory = async () => {
    try {
      const data = await fetchRecentRequirements()
      setHistory(data || [])
    } catch (e) {
      console.error('Failed to load requirement history:', e)
    }
  }

  const handleSelect = async (item) => {
    setRequirement(item.content)
    await updateRequirementUseCount(item.id)
    setShowSelector(false)
    loadHistory() // 刷新使用次数
  }

  const handleSaveCurrent = async () => {
    if (!requirement.trim()) return
    setSaving(true)
    try {
      const frameIds = frames.map(f => f.frameId)
      await saveRequirement(requirement, frameIds, platform)
      await loadHistory()
      setShowSelector(false)
    } catch (e) {
      console.error('Failed to save requirement:', e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="eyebrow">{t('requirement.label')}</label>
        <div className="flex gap-2">
          {requirement.trim() && (
            <button
              onClick={handleSaveCurrent}
              disabled={saving}
              className="text-xs text-umber-600 hover:text-umber-700 disabled:opacity-50"
            >
              {saving ? t('common.saving') : t('common.save')}
            </button>
          )}
          <button
            onClick={() => {
              loadHistory()
              setShowSelector(!showSelector)
            }}
            className="text-xs text-ink-400 hover:text-ink-700"
          >
            {t('requirement.history', { count: history.length })}
          </button>
        </div>
      </div>

      <textarea
        value={requirement}
        onChange={e => setRequirement(e.target.value)}
        placeholder={t('requirement.placeholder')}
        className="h-28 w-full resize-none rounded-2xl border border-ink-900/10 bg-paper-100/70 px-3 py-2 text-sm text-ink-900 outline-none transition-colors placeholder:text-ink-400 focus:border-umber-400"
      />

      {showSelector && (
        <div className="max-h-48 overflow-y-auto rounded-2xl border border-ink-900/10 bg-paper-50 shadow-soft">
          {history.length === 0 ? (
            <div className="p-3 text-center text-xs text-ink-400">{t('requirement.noHistory')}</div>
          ) : (
            history.map((item) => (
              <button
                key={item.id}
                onClick={() => handleSelect(item)}
                className="w-full cursor-pointer border-b border-ink-900/6 px-3 py-2 text-left transition-colors last:border-0 hover:bg-paper-100"
              >
                <div className="line-clamp-2 text-xs text-ink-700">{item.content}</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] text-ink-400">
                    {item.platform}
                  </span>
                  {item.useCount > 0 && (
                    <span className="text-[10px] text-ink-400">
                      {t('requirement.usedTimes', { count: item.useCount })}
                    </span>
                  )}
                  <span className="ml-auto text-[10px] text-ink-400">
                    {new Date(item.lastUsedAt || item.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
