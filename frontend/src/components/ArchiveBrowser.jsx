import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchVideoArchives, fetchFrameArchives, fetchFramesByVideo, deleteVideoArchive, deleteFrameArchive } from '../api/client.js'
import SegmentedControl from './SegmentedControl.jsx'

export default function ArchiveBrowser({ onSelectVideo, onSelectFrames }) {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState('videos')
  const [videos, setVideos] = useState([])
  const [frames, setFrames] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedVideo, setSelectedVideo] = useState(null)
  const [videoFrames, setVideoFrames] = useState([])

  useEffect(() => {
    loadData()
  }, [activeTab])

  const loadData = async () => {
    setLoading(true)
    try {
      if (activeTab === 'videos') {
        const data = await fetchVideoArchives()
        setVideos(data || [])
      } else {
        const data = await fetchFrameArchives()
        setFrames(data || [])
      }
    } catch (e) {
      console.error('Failed to load archives:', e)
    } finally {
      setLoading(false)
    }
  }

  const handleSelectVideo = async (video) => {
    setSelectedVideo(video)
    
    // 加载关联的帧
    try {
      const relatedFrames = await fetchFramesByVideo(video.id)
      setVideoFrames(relatedFrames || [])
      
      // 回调给父组件，传入视频和关联帧
      if (onSelectVideo) {
        onSelectVideo(video, relatedFrames || [])
      }
    } catch (e) {
      console.error('Failed to load video frames:', e)
      if (onSelectVideo) {
        onSelectVideo(video, [])
      }
    }
  }

  const handleDeleteVideo = async (id) => {
    if (!confirm(t('archive.deleteVideoConfirm'))) return
    try {
      await deleteVideoArchive(id)
      if (selectedVideo?.id === id) {
        setSelectedVideo(null)
        setVideoFrames([])
      }
      loadData()
    } catch (e) {
      alert(t('common.deleteFailed', { message: e.message }))
    }
  }

  const handleDeleteFrame = async (id) => {
    if (!confirm(t('archive.deleteFrameConfirm'))) return
    try {
      await deleteFrameArchive(id)
      loadData()
      // 如果当前选中的视频的帧被删除了，刷新帧列表
      if (selectedVideo) {
        const relatedFrames = await fetchFramesByVideo(selectedVideo.id)
        setVideoFrames(relatedFrames || [])
      }
    } catch (e) {
      alert(t('common.deleteFailed', { message: e.message }))
    }
  }

  return (
    <div className="card-paper space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h3 className="eyebrow">{t('archive.title')}</h3>
        <SegmentedControl
          ariaLabel={t('archive.title')}
          value={activeTab}
          onChange={(tab) => {
            setActiveTab(tab)
            setSelectedVideo(null)
            setVideoFrames([])
          }}
          options={[
            { id: 'videos', label: t('archive.videos') },
            { id: 'frames', label: t('archive.frames') },
          ]}
        />
      </div>

      {loading ? (
        <div className="py-4 text-center text-xs text-ink-400">{t('common.loading')}</div>
      ) : activeTab === 'videos' ? (
        <div className="max-h-64 space-y-2 overflow-y-auto scrollbar-thin">
          {videos.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-ink-900/12 bg-paper-100/60 py-5 text-center text-xs text-ink-400">{t('archive.noVideos')}</div>
          ) : (
            videos.map(video => (
              <div key={video.id} className={`group flex cursor-pointer items-center gap-3 rounded-2xl border p-2 transition-all ${
                selectedVideo?.id === video.id ? 'border-umber-400 bg-umber-50/70' : 'border-ink-900/8 bg-paper-100/50 hover:bg-paper-50'
              }`}>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-paper-200 text-sm text-ink-500">VID</div>
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleSelectVideo(video)}>
                  <div className="truncate text-xs text-ink-700">{video.filename}</div>
                  <div className="text-[10px] text-ink-400">
                    {video.duration}s · {formatSize(video.fileSize)} · {t('home.frameCount', { count: video.frameCount || 0 })}
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleSelectVideo(video)}
                    className="rounded-full bg-ink-900 px-2 py-1 text-xs text-paper-50 hover:bg-umber-600"
                  >
                    {t('common.use')}
                  </button>
                  <button
                    onClick={() => handleDeleteVideo(video.id)}
                    className="rounded-full bg-clay-500/90 px-2 py-1 text-xs text-paper-50 hover:bg-clay-500"
                  >
                    {t('common.delete')}
                  </button>
                </div>
              </div>
            ))
          )}
          
          {/* 显示选中视频的关联帧 */}
          {selectedVideo && videoFrames.length > 0 && (
            <div className="mt-3 border-t border-ink-900/10 pt-3">
              <div className="mb-2 text-xs text-ink-400">
                {t('archive.relatedFrames', { count: videoFrames.length })}
              </div>
              <div className="grid grid-cols-4 gap-1">
                {videoFrames.map(frame => (
                  <div key={frame.id} className="aspect-video overflow-hidden rounded-lg bg-paper-200">
                    {frame.base64Preview && (
                      <img
                        src={`data:image/jpeg;base64,${frame.base64Preview}`}
                        alt={frame.description}
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                ))}
              </div>
              <button
                onClick={() => onSelectFrames?.(videoFrames)}
                className="mt-2 w-full rounded-full bg-sage-700 py-1.5 text-xs text-paper-50 hover:bg-sage-500"
              >
                {t('archive.useAllFrames', { count: videoFrames.length })}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid max-h-64 grid-cols-3 gap-2 overflow-y-auto scrollbar-thin">
          {frames.length === 0 ? (
            <div className="col-span-3 rounded-2xl border border-dashed border-ink-900/12 bg-paper-100/60 py-5 text-center text-xs text-ink-400">{t('archive.noFrames')}</div>
          ) : (
            frames.map(frame => (
              <div key={frame.id} className="group relative aspect-video overflow-hidden rounded-xl bg-paper-200">
                {frame.base64Preview && (
                  <img
                    src={`data:image/jpeg;base64,${frame.base64Preview}`}
                    alt={frame.description}
                    className="w-full h-full object-cover"
                  />
                )}
                <div className="absolute inset-0 flex items-center justify-center gap-1 bg-ink-900/65 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => onSelectFrames?.([frame])}
                    className="rounded-full bg-paper-50 px-2 py-1 text-xs text-ink-900"
                  >
                    {t('common.use')}
                  </button>
                  <button
                    onClick={() => handleDeleteFrame(frame.id)}
                    className="rounded-full bg-clay-500 px-2 py-1 text-xs text-paper-50"
                  >
                    {t('common.delete')}
                  </button>
                </div>
                {frame.description && (
                  <div className="absolute bottom-0 left-0 right-0 truncate bg-ink-900/70 px-1 py-0.5 text-[10px] text-paper-50">
                    {frame.description}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

function formatSize(bytes) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let size = bytes
  let unitIndex = 0
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`
}
