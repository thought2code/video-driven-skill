import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import useAppStore from '../store/useAppStore.js'

export default function FrameTimeline() {
  const { t } = useTranslation()
  const frames = useAppStore(s => s.frames)
  const selectedFrameId = useAppStore(s => s.selectedFrameId)
  const setSelectedFrameId = useAppStore(s => s.setSelectedFrameId)
  const removeFrame = useAppStore(s => s.removeFrame)
  const moveFrame = useAppStore(s => s.moveFrame)
  const reorderFrames = useAppStore(s => s.reorderFrames)

  const [deletingId, setDeletingId] = useState(null)
  const [dragOverIndex, setDragOverIndex] = useState(null)
  const dragItemRef = useRef(null)

  if (frames.length === 0) {
    return (
      <div className='rounded-2xl border border-dashed border-ink-900/12 bg-paper-100/60 py-6 text-center text-sm text-ink-400'>
        {t('frameTimeline.empty')}
      </div>
    )
  }

  const fmt = (s) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const handleDelete = (e, frameId, index) => {
    e.stopPropagation()
    
    setDeletingId(frameId)
    removeFrame(frameId)
    setDeletingId(null)
  }

  const handleMove = (e, frameId, direction) => {
    e.stopPropagation()
    moveFrame(frameId, direction)
  }

  // Drag and Drop handlers
  const handleDragStart = (e, index) => {
    dragItemRef.current = index
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', index)
    // Add a slight delay to show the drag image
    setTimeout(() => {
      e.target.classList.add('opacity-50')
    }, 0)
  }

  const handleDragEnd = (e) => {
    e.target.classList.remove('opacity-50')
    dragItemRef.current = null
    setDragOverIndex(null)
  }

  const handleDragOver = (e, index) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIndex(index)
  }

  const handleDragLeave = () => {
    setDragOverIndex(null)
  }

  const handleDrop = (e, dropIndex) => {
    e.preventDefault()
    const dragIndex = parseInt(e.dataTransfer.getData('text/plain'))
    
    if (dragIndex === dropIndex || isNaN(dragIndex)) {
      setDragOverIndex(null)
      return
    }

    // Reorder frames
    const newFrames = [...frames]
    const [removed] = newFrames.splice(dragIndex, 1)
    newFrames.splice(dropIndex, 0, removed)
    reorderFrames(newFrames)
    
    setDragOverIndex(null)
  }

  return (
    <div className='flex min-w-0 gap-3 overflow-x-auto pb-2 scrollbar-thin' style={{ maxWidth: '100%' }}>
      {frames.map((frame, index) => (
        <div
          key={frame.frameId}
          onDragOver={(e) => handleDragOver(e, index)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, index)}
          className={`group relative flex-shrink-0 cursor-pointer overflow-hidden rounded-2xl border bg-paper-50 p-1 shadow-soft transition-all
            ${selectedFrameId === frame.frameId ? 'border-umber-400 -translate-y-0.5 shadow-lift' : 'border-ink-900/10 hover:border-ink-900/20'}
            ${dragOverIndex === index ? 'ring-2 ring-umber-400 ring-offset-2 ring-offset-paper-50' : ''}
            ${dragItemRef.current === index ? 'opacity-50' : ''}`}
          onClick={() => setSelectedFrameId(frame.frameId)}
        >
          {/* 左移按钮 */}
          {index > 0 && (
            <button
              className='absolute left-1.5 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-paper-50/90 text-xs text-ink-700 opacity-0 shadow-soft ring-1 ring-ink-900/10 transition-opacity hover:bg-umber-50 group-hover:opacity-100'
              onClick={(e) => handleMove(e, frame.frameId, 'left')}
              title={t('frameTimeline.moveLeft')}
            >
              ←
            </button>
          )}

          {/* 右移按钮 */}
          {index < frames.length - 1 && (
            <button
              className='absolute right-1.5 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-paper-50/90 text-xs text-ink-700 opacity-0 shadow-soft ring-1 ring-ink-900/10 transition-opacity hover:bg-umber-50 group-hover:opacity-100'
              onClick={(e) => handleMove(e, frame.frameId, 'right')}
              title={t('frameTimeline.moveRight')}
            >
              →
            </button>
          )}

          <img
            src={`data:image/jpeg;base64,${frame.base64Image}`}
            alt={`Frame at ${fmt(frame.timestamp)}`}
            className='h-16 w-28 rounded-xl object-cover pointer-events-none'
            draggable={false}
          />
          
          {/* 序号 - 拖拽句柄 */}
          <div 
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragEnd={handleDragEnd}
            className='absolute left-2 top-2 z-20 cursor-move rounded-full bg-ink-900/80 px-2 py-0.5 font-mono text-[10px] text-paper-50 shadow-soft hover:bg-umber-600'
            title={t('frameTimeline.frameN', { n: index + 1 })}
          >
            {index + 1}
          </div>

          <div className='absolute bottom-1 left-1 right-1 rounded-b-xl bg-ink-900/70 py-0.5 text-center font-mono text-[10px] text-paper-50 backdrop-blur-sm'>
            {fmt(frame.timestamp)}
          </div>

          {/* 删除按钮 */}
          <button
            className={`absolute right-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-clay-500/85 text-xs text-paper-50 transition-opacity hover:bg-clay-500
              ${deletingId === frame.frameId ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
            onClick={(e) => handleDelete(e, frame.frameId, index)}
            disabled={deletingId === frame.frameId}
            title={t('common.delete')}
          >
            {deletingId === frame.frameId ? (
              <span className='w-3 h-3 border-2 border-paper-50/30 border-t-paper-50 rounded-full animate-spin' />
            ) : (
              '×'
            )}
          </button>

          {/* 有描述标记 */}
          {frame.description && (
            <div className='absolute bottom-6 left-2 h-2 w-2 rounded-full bg-sage-500 ring-2 ring-paper-50' title={t('frameTimeline.hasDescription')} />
          )}
        </div>
      ))}
    </div>
  )
}
