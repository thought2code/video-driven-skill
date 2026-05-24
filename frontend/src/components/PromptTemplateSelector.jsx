import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchPromptTemplates, createPromptTemplate, deletePromptTemplate, incrementTemplateUseCount } from '../api/client.js'
import AppSelect from './AppSelect.jsx'

export default function PromptTemplateSelector({ value, onChange, onSelect }) {
  const { t } = useTranslation()
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(false)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [newTemplateName, setNewTemplateName] = useState('')
  const [newTemplateCategory, setNewTemplateCategory] = useState('custom')

  useEffect(() => {
    loadTemplates()
  }, [])

  const loadTemplates = async () => {
    setLoading(true)
    try {
      const data = await fetchPromptTemplates()
      setTemplates(data || [])
    } catch (e) {
      console.error('Failed to load templates:', e)
    } finally {
      setLoading(false)
    }
  }

  const handleSelectTemplate = async (template) => {
    const newValue = value 
      ? value + '\n\n' + template.content 
      : template.content
    onChange(newValue)
    
    try {
      await incrementTemplateUseCount(template.id)
    } catch (e) {
      // ignore
    }
    
    if (onSelect) onSelect(template)
  }

  const handleSaveTemplate = async () => {
    if (!newTemplateName.trim() || !value.trim()) return
    
    try {
      await createPromptTemplate({
        name: newTemplateName,
        content: value,
        category: newTemplateCategory
      })
      setShowSaveDialog(false)
      setNewTemplateName('')
      loadTemplates()
    } catch (e) {
      alert(t('common.saveFailed', { message: e.message }))
    }
  }

  const handleDeleteTemplate = async (id, e) => {
    e.stopPropagation()
    if (!confirm(t('promptTemplate.deleteConfirm'))) return
    
    try {
      await deletePromptTemplate(id)
      loadTemplates()
    } catch (err) {
      alert(t('common.deleteFailed', { message: err.message }))
    }
  }

  const getCategoryStyle = (category) => {
    switch (category) {
      case 'error-handling': return { icon: '🛡️', label: t('promptTemplate.category.errorHandling'), color: 'bg-red-900/50 text-red-400' }
      case 'logging': return { icon: '📝', label: t('promptTemplate.category.logging'), color: 'bg-blue-900/50 text-blue-400' }
      case 'data-extraction': return { icon: '📊', label: t('promptTemplate.category.dataExtraction'), color: 'bg-green-900/50 text-green-400' }
      default: return { icon: '✨', label: t('promptTemplate.category.custom'), color: 'bg-purple-900/50 text-purple-400' }
    }
  }

  const categoryOptions = [
    { value: 'custom', label: `✨ ${t('promptTemplate.category.custom')}` },
    { value: 'error-handling', label: `🛡️ ${t('promptTemplate.category.errorHandling')}` },
    { value: 'logging', label: `📝 ${t('promptTemplate.category.logging')}` },
    { value: 'data-extraction', label: `📊 ${t('promptTemplate.category.dataExtraction')}` },
  ]

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">{t('promptTemplate.commonTemplates')}</span>
        <button
          onClick={() => setShowSaveDialog(true)}
          disabled={!value.trim()}
          className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50"
        >
          💾 {t('promptTemplate.saveAsTemplate')}
        </button>
      </div>

      {loading ? (
        <div className="text-xs text-slate-500">{t('common.loading')}</div>
      ) : templates.length === 0 ? (
        <div className="text-xs text-slate-600">{t('promptTemplate.noTemplates')}</div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {templates.slice(0, 6).map(template => {
            const style = getCategoryStyle(template.category)
            return (
              <button
                key={template.id}
                onClick={() => handleSelectTemplate(template)}
                className={`group relative px-2 py-1 rounded-md text-xs transition-all hover:opacity-80 ${style.color}`}
                title={template.content.substring(0, 100) + '...'}
              >
                <span className="mr-1">{style.icon}</span>
                {template.name}
                <span className="ml-1 opacity-50">({template.useCount || 0})</span>
                
                <span
                  onClick={(e) => handleDeleteTemplate(template.id, e)}
                  className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 text-white rounded-full text-[10px] 
                           flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ×
                </span>
              </button>
            )
          })}
        </div>
      )}

      {showSaveDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-4 w-80">
            <h3 className="text-white text-sm font-medium mb-3">{t('promptTemplate.saveDialogTitle')}</h3>
            
            <input
              type="text"
              placeholder={t('promptTemplate.templateName')}
              value={newTemplateName}
              onChange={(e) => setNewTemplateName(e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white mb-3"
            />
            
            <AppSelect
              value={newTemplateCategory}
              onChange={setNewTemplateCategory}
              options={categoryOptions}
              variant='dark'
              className='mb-4'
              aria-label={t('promptTemplate.templateCategory')}
            />
            
            <div className="flex gap-2">
              <button
                onClick={() => setShowSaveDialog(false)}
                className="flex-1 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-lg"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSaveTemplate}
                disabled={!newTemplateName.trim()}
                className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm rounded-lg"
              >
                {t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
