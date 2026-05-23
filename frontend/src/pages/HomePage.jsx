import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation, Trans } from 'react-i18next'
import LanguageSwitcher from '../components/LanguageSwitcher.jsx'
import SegmentedControl from '../components/SegmentedControl.jsx'
import {
  uploadVideo,
  fetchSkillList,
  fetchVideoArchives,
  fetchFrameArchives,
  fetchFramesByVideo,
  importSkill,
} from '../api/client.js'
import useAppStore from '../store/useAppStore.js'
import ScreenRecorderModal from '../components/ScreenRecorderModal.jsx'
import { isScreenRecordingSupported } from '../utils/screenRecorder.js'

export default function HomePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const setVideo = useAppStore(s => s.setVideo)
  const setFrames = useAppStore(s => s.setFrames)
  const setActiveTab = useAppStore(s => s.setActiveTab)
  const setSkill = useAppStore(s => s.setSkill)
  const reset = useAppStore(s => s.reset)

  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState(null)

  const [skills, setSkills] = useState([])
  const [loadingSkills, setLoadingSkills] = useState(true)

  const [videoArchives, setVideoArchives] = useState([])
  const [frameArchives, setFrameArchives] = useState([])
  const [archiveTab, setArchiveTab] = useState('videos')
  const [loadingArchives, setLoadingArchives] = useState(true)

  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [recorderOpen, setRecorderOpen] = useState(false)
  const canRecord = isScreenRecordingSupported()

  const inputRef = useRef()
  const importInputRef = useRef()

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoadingSkills(true); setLoadingArchives(true)
    try {
      const [skillList, videos, frames] = await Promise.all([
        fetchSkillList(), fetchVideoArchives(), fetchFrameArchives()
      ])
      setSkills(skillList?.slice(0, 8) || [])
      setVideoArchives(videos || [])
      setFrameArchives(frames || [])
    } catch (e) { console.error('Failed to load data:', e) }
    finally { setLoadingSkills(false); setLoadingArchives(false) }
  }

  const handleFile = async (file, onProgress = setProgress) => {
    if (!file || !file.type.startsWith('video/')) {
      setError(t('home.invalidVideo'))
      return
    }
    setError(null); setUploading(true); onProgress(0); reset()
    try {
      const res = await uploadVideo(file, onProgress)
      setVideo(res.videoId, res.filename, res.duration)
      navigate(`/playground/${res.videoId}`)
    } catch (e) {
      setError(e.message)
      setUploading(false)
      throw e
    }
  }

  const handleRecordingUpload = async (file, onProgress) => {
    await handleFile(file, onProgress)
  }

  const handleDrop = (e) => {
    e.preventDefault(); setDragging(false)
    handleFile(e.dataTransfer.files[0])
  }

  const handleImportSkill = async (file) => {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.zip')) {
      setError(t('home.invalidZip')); return
    }
    setError(null); setImporting(true); setImportProgress(0)
    try {
      const imported = await importSkill(file, setImportProgress)
      setSkill(imported.skillId, imported.skillName, imported.files, imported.variables || [])
      setActiveTab('skill')
      navigate(`/playground/${imported.skillId}`)
    } catch (e) { setError(t('common.importFailed', { message: e.message })) }
    finally { setImporting(false); setImportProgress(0) }
  }

  const handleUseSkill = (skill) => {
    reset()
    setSkill(skill.skillId, skill.skillName, null, [])
    setActiveTab('skill')
    navigate(`/playground/${skill.skillId}`)
  }

  const handleUseVideoArchive = async (video) => {
    reset()
    setVideo(video.id, video.filename, video.duration || 0)
    try {
      const frames = await fetchFramesByVideo(video.id)
      if (frames && frames.length > 0) {
        setFrames(frames.map(f => ({
          frameId: f.frameId, timestamp: f.timestamp,
          base64Image: f.base64Preview || f.base64Image,
          description: f.description, annotationJson: f.annotationJson,
        })))
      }
    } catch (e) { console.error(e) }
    setActiveTab('annotate')
    navigate(`/playground/${video.id}`)
  }

  const handleUseFrameArchive = async (frame) => {
    reset()
    const formatted = {
      frameId: frame.frameId, timestamp: frame.timestamp,
      base64Image: frame.base64Preview || frame.base64Image,
      description: frame.description, annotationJson: frame.annotationJson,
    }
    setFrames([formatted])
    if (frame.videoArchiveId) {
      const related = videoArchives.find(v => v.id === frame.videoArchiveId)
      if (related) {
        setVideo(related.id, related.filename, related.duration || 0)
        setActiveTab('annotate'); navigate(`/playground/${related.id}`); return
      }
    }
    setActiveTab('skill'); navigate('/playground/frames')
  }

  return (
    <div className='min-h-screen'>
      {/* Ambient gradient */}
      <div
        aria-hidden
        className='pointer-events-none fixed inset-x-0 top-0 h-[360px] opacity-35'
        style={{
          background:
            'radial-gradient(ellipse at 50% 0%, rgba(184, 138, 94, 0.18) 0%, rgba(184, 138, 94, 0.04) 45%, transparent 70%)',
        }}
      />

      <div className='relative max-w-[1120px] mx-auto px-6 lg:px-10 pt-10 pb-20'>

        {/* ── Masthead ── */}
        <header className='flex items-end justify-between pb-8 border-b hairline stagger'>
          <div className='md:hidden absolute top-10 right-6'>
            <LanguageSwitcher />
          </div>
          <div>
            <div className='eyebrow mb-3 flex items-center gap-3'>
              <span>Video Driven</span>
              <span className='w-5 h-px bg-ink-200'></span>
              <span>Studio</span>
            </div>
            <h1 className='font-display text-[52px] leading-[1.05] text-ink-900 tracking-[-0.02em]'>
              <Trans
                i18nKey='home.heroTitle'
                components={{
                  em: <span className='italic text-umber-500' style={{ fontVariationSettings: "'SOFT' 60, 'opsz' 144" }} />,
                }}
              />
            </h1>
            <p className='mt-4 text-ink-500 text-[14px] leading-relaxed whitespace-nowrap'>
              {t('home.heroSubtitle')}
            </p>
          </div>

          <div className='hidden md:flex flex-col items-end gap-3 pb-1'>
            <LanguageSwitcher />
          </div>
        </header>

        {/* ── Quick Actions + Upload ── */}
        <section className='mt-8 stagger'>
          <div className={`grid grid-cols-1 sm:grid-cols-2 gap-5 ${canRecord ? 'xl:grid-cols-4' : 'lg:grid-cols-3'}`}>

            {/* Upload zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => !uploading && inputRef.current?.click()}
              className={`relative card-paper overflow-hidden cursor-pointer group transition-all duration-500
                ${dragging ? 'ring-2 ring-umber-400/50 -translate-y-0.5' : 'hover:-translate-y-0.5 hover:shadow-lift'}`}
              style={{ padding: '40px 32px' }}
            >
              <input ref={inputRef} type='file' accept='video/*' className='hidden'
                onChange={(e) => handleFile(e.target.files[0])} />
              <Corners />

              {uploading ? (
                <div className='text-center py-4'>
                  <div className='inline-flex flex-col items-center gap-4'>
                    <RingProgress value={progress} />
                    <div>
                      <div className='font-display text-xl text-ink-900 mb-1'>{t('common.uploading')}</div>
                      <div className='font-mono text-[11px] text-ink-400 tracking-wider'>{progress}%</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className='relative text-center'>
                  <div className='eyebrow mb-4'>Step 01 · Upload</div>
                  <div className='font-display text-[26px] leading-tight text-ink-900 mb-2'>
                    {t('home.uploadVideo')}
                  </div>
                  <p className='text-ink-500 text-[12.5px] max-w-[220px] mx-auto leading-relaxed mb-5'>
                    {t('home.uploadHint')}
                  </p>
                  <div className='inline-flex items-center gap-2 text-[12px] text-umber-600 font-medium
                                  transition-transform duration-500 group-hover:translate-x-1'>
                    <span>{t('home.chooseFile')}</span>
                    <ArrowIcon />
                  </div>
                </div>
              )}
            </div>

            {canRecord && (
              <div
                onClick={() => !uploading && !importing && setRecorderOpen(true)}
                className={`relative card-paper overflow-hidden cursor-pointer group transition-all duration-500
                  ${uploading || importing ? 'opacity-60 pointer-events-none' : 'hover:-translate-y-0.5 hover:shadow-lift'}`}
                style={{ padding: '40px 32px' }}
              >
                <Corners />
                <div className='relative text-center'>
                  <div className='eyebrow mb-4'>Step 01 · Record</div>
                  <div className='w-11 h-11 mx-auto rounded-xl bg-clay-500/10 flex items-center justify-center text-clay-600 mb-3 group-hover:bg-clay-500/15 transition-colors duration-300'>
                    <RecordIcon />
                  </div>
                  <div className='font-display text-[26px] leading-tight text-ink-900 mb-2'>
                    {t('home.startRecording')}
                  </div>
                  <p className='text-ink-500 text-[12.5px] max-w-[220px] mx-auto leading-relaxed mb-5'>
                    {t('home.recordHint')}
                  </p>
                  <div className='inline-flex items-center gap-2 text-[12px] text-clay-600 font-medium transition-transform duration-500 group-hover:translate-x-1'>
                    <span>{t('home.recordNow')}</span>
                    <ArrowIcon />
                  </div>
                </div>
              </div>
            )}

            {/* Import skill */}
            <div
              onClick={() => !importing && importInputRef.current?.click()}
              className='relative card-paper overflow-hidden cursor-pointer group transition-all duration-500 hover:-translate-y-0.5 hover:shadow-lift flex flex-col items-center justify-center text-center'
              style={{ padding: '40px 32px' }}
            >
              <input
                ref={importInputRef}
                type='file'
                accept='.zip,application/zip,application/x-zip-compressed'
                className='hidden'
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; handleImportSkill(f) }}
              />
              <Corners />
              <div className='eyebrow mb-4'>Step 02 · Import</div>
              <div className='w-11 h-11 rounded-xl bg-paper-200/70 flex items-center justify-center text-ink-500 mb-3 group-hover:bg-umber-50 transition-colors duration-300'>
                <ImportIcon />
              </div>
              <div className='font-display text-[17px] text-ink-900 mb-1'>
                {importing ? t('common.importing') : t('home.importSkillZip')}
              </div>
              {importing && (
                <div className='font-mono text-[11px] text-umber-600 tracking-wider'>{importProgress}%</div>
              )}
              {!importing && (
                <p className='text-ink-400 text-[12px]'>{t('home.importSkillHint')}</p>
              )}
            </div>

            {/* Browse all skills */}
            <div
              onClick={() => { reset(); setActiveTab('skill'); navigate('/playground/history') }}
              className='relative card-paper overflow-hidden cursor-pointer group transition-all duration-500 hover:-translate-y-0.5 hover:shadow-lift flex flex-col items-center justify-center text-center'
              style={{ padding: '40px 32px' }}
            >
              <Corners />
              <div className='eyebrow mb-4'>Step 03 · Browse</div>
              <div className='w-11 h-11 rounded-xl bg-paper-200/70 flex items-center justify-center text-ink-500 mb-3 group-hover:bg-umber-50 transition-colors duration-300'>
                <BrowseIcon />
              </div>
              <div className='font-display text-[17px] text-ink-900 mb-1'>{t('home.allSkills')}</div>
              <p className='text-ink-400 text-[12px]'>
                {t('home.allSkillsHint')}
              </p>
            </div>
          </div>
        </section>

        {error && (
          <div className='mt-5 px-5 py-3 rounded-xl bg-clay-500/10 border border-clay-500/30 text-clay-700 text-sm'>
            {error}
          </div>
        )}

        {/* ── Two-column content ── */}
        <main className='mt-8 grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-6 stagger'>

          {/* Left — Skill list */}
          <section className='card-paper p-6'>
            <div className='flex items-end justify-between mb-5'>
              <div>
                <div className='eyebrow mb-1.5'>{t('home.recentSkillsEyebrow')}</div>
                <h3 className='font-display text-lg text-ink-900'>{t('home.recentSkills')}</h3>
              </div>
              {skills.length > 5 && (
                <button
                  onClick={() => { reset(); setActiveTab('skill'); navigate('/playground/history') }}
                  className='btn-ghost'
                >
                  {t('home.viewAll')}
                  <ArrowIcon small />
                </button>
              )}
            </div>

            {loadingSkills ? (
              <SkillListSkeleton />
            ) : skills.length === 0 ? (
              <EmptyBlock hint={t('home.noSkillsYet')} />
            ) : (
              <ul className='divide-y divide-ink-900/[0.06]'>
                {skills.map((skill, idx) => (
                  <li
                    key={skill.skillId}
                    onClick={() => handleUseSkill(skill)}
                    className='group flex items-center gap-4 py-3.5 cursor-pointer transition-colors duration-300 hover:bg-paper-200/40 -mx-2 px-2 rounded-lg'
                  >
                    <div className='w-8 h-8 rounded-lg bg-paper-200/70 flex items-center justify-center shrink-0 group-hover:bg-umber-50 transition-colors duration-300'>
                      <SkillIcon platform={skill.platform} />
                    </div>
                    <div className='flex-1 min-w-0'>
                      <div className='font-display text-[15px] text-ink-900 truncate leading-tight'>
                        {skill.skillName || t('common.unnamed')}
                      </div>
                      <div className='mt-0.5 flex items-center gap-2'>
                        {skill.platform && (
                          <span className='inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-medium tracking-wide text-ink-500 bg-paper-200/60'>
                            {skill.platform}
                          </span>
                        )}
                        {skill.description && (
                          <span className='text-[11px] text-ink-400 truncate max-w-[200px]'>
                            {skill.description}
                          </span>
                        )}
                      </div>
                    </div>
                    <ArrowIcon tiny />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Right — Archives */}
          <section className='card-paper p-6'>
            <div className='flex items-end justify-between mb-5'>
              <div>
                <div className='eyebrow mb-1.5'>{t('home.archiveEyebrow')}</div>
                <h3 className='font-display text-lg text-ink-900'>{t('home.archive')}</h3>
              </div>
              <SegmentedControl
                ariaLabel={t('home.archive')}
                value={archiveTab}
                onChange={setArchiveTab}
                options={[
                  { id: 'videos', label: `${t('home.videosTab')} ${videoArchives.length}` },
                  { id: 'frames', label: `${t('home.framesTab')} ${frameArchives.length}` },
                ]}
              />
            </div>

            <div className='min-h-[280px]'>
              {loadingArchives ? (
                <div className='py-12 text-center'>
                  <div className='inline-block w-4 h-4 rounded-full border-2 border-ink-200 border-t-umber-500 animate-spin'></div>
                </div>
              ) : archiveTab === 'videos' ? (
                videoArchives.length === 0 ? (
                  <EmptyBlock hint={t('home.noVideosArchived')} />
                ) : (
                  <ul className='space-y-2 max-h-[340px] overflow-y-auto scrollbar-thin pr-1'>
                    {videoArchives.map(video => (
                      <li key={video.id}
                        onClick={() => handleUseVideoArchive(video)}
                        className='group flex items-center gap-3 p-3 rounded-xl border border-ink-900/[0.06] bg-paper-50 hover:bg-paper-200/50 hover:border-ink-900/[0.1] cursor-pointer transition-all duration-300'>
                        <div className='w-9 h-9 rounded-lg bg-gradient-to-br from-paper-200 to-paper-300 flex items-center justify-center text-ink-500 shadow-inset-hair shrink-0'>
                          <VideoGlyph />
                        </div>
                        <div className='flex-1 min-w-0'>
                          <div className='text-[13px] text-ink-900 truncate'>{video.filename}</div>
                          <div className='mt-0.5 font-mono text-[10px] text-ink-400 tracking-wide'>
                            {video.frameCount > 0 ? t('home.frameCount', { count: video.frameCount }) : t('home.framesNotExtracted')}
                            <span className='divider-dot'></span>
                            {formatSize(video.fileSize)}
                          </div>
                        </div>
                        <ArrowIcon tiny />
                      </li>
                    ))}
                  </ul>
                )
              ) : (
                frameArchives.length === 0 ? (
                  <EmptyBlock hint={t('home.noFramesArchived')} />
                ) : (
                  <div className='grid grid-cols-3 gap-2 max-h-[340px] overflow-y-auto scrollbar-thin pr-1'>
                    {frameArchives.map(frame => (
                      <div key={frame.id}
                        onClick={() => handleUseFrameArchive(frame)}
                        className='group relative aspect-video rounded-lg overflow-hidden cursor-pointer ring-1 ring-ink-900/[0.06] hover:ring-umber-500/40 hover:-translate-y-0.5 transition-all duration-300'>
                        {frame.base64Preview ? (
                          <img src={`data:image/jpeg;base64,${frame.base64Preview}`} alt='' className='w-full h-full object-cover' />
                        ) : (
                          <div className='w-full h-full bg-paper-200 flex items-center justify-center text-ink-400'>—</div>
                        )}
                        <div className='absolute inset-0 bg-ink-900/0 group-hover:bg-ink-900/55 transition-colors duration-300 flex items-center justify-center'>
                          <span className='text-[11px] text-paper-50 font-medium tracking-wider opacity-0 group-hover:opacity-100 transition-opacity duration-300'>
                            {t('common.use')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          </section>
        </main>

        {/* ── Footer ── */}
        <footer className='mt-16 pt-6 border-t hairline flex items-center justify-between text-[11px] text-ink-400 font-mono tracking-wider'>
          <span>VIDEO DRIVEN SKILL · {new Date().getFullYear()} · Open Source</span>
          <span>Built for reuse</span>
        </footer>
      </div>

      <ScreenRecorderModal
        open={recorderOpen}
        onClose={() => setRecorderOpen(false)}
        onUpload={handleRecordingUpload}
      />
    </div>
  )
}

/* ── Atoms ── */

function Corners() {
  return (
    <>
      {['top-3 left-3', 'top-3 right-3', 'bottom-3 left-3', 'bottom-3 right-3'].map((pos, i) => (
        <span key={i} aria-hidden className={`absolute ${pos} w-2.5 h-2.5 opacity-25`}>
          <span className={`absolute ${i === 0 || i === 2 ? 'left-0' : 'right-0'} ${i < 2 ? 'top-0' : 'bottom-0'} w-full h-px bg-ink-900`} />
          <span className={`absolute ${i === 0 || i === 2 ? 'left-0' : 'right-0'} ${i < 2 ? 'top-0' : 'bottom-0'} h-full w-px bg-ink-900`} />
        </span>
      ))}
    </>
  )
}

function ArrowIcon({ small, tiny }) {
  const size = tiny ? 12 : small ? 13 : 15
  return (
    <svg width={size} height={size} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.6' strokeLinecap='round' strokeLinejoin='round'>
      <path d='M5 12h14M13 5l7 7-7 7' />
    </svg>
  )
}

function ImportIcon() {
  return (
    <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round'>
      <path d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3' />
    </svg>
  )
}

function BrowseIcon() {
  return (
    <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round'>
      <rect x='3' y='3' width='7' height='7' rx='1.5' />
      <rect x='14' y='3' width='7' height='7' rx='1.5' />
      <rect x='3' y='14' width='7' height='7' rx='1.5' />
      <rect x='14' y='14' width='7' height='7' rx='1.5' />
    </svg>
  )
}

function SkillIcon({ platform }) {
  if (platform === 'android') {
    return (
      <svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' strokeLinejoin='round'>
        <rect x='5' y='2' width='14' height='20' rx='2.5' />
        <path d='M12 18h.01' />
      </svg>
    )
  }
  if (platform === 'ios') {
    return (
      <svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' strokeLinejoin='round'>
        <rect x='5' y='2' width='14' height='20' rx='3' />
        <path d='M12 18h.01' />
      </svg>
    )
  }
  // browser / default
  return (
    <svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' strokeLinejoin='round'>
      <circle cx='12' cy='12' r='9' />
      <path d='M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z' />
    </svg>
  )
}

function VideoGlyph() {
  return (
    <svg width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' strokeLinejoin='round'>
      <rect x='3' y='6' width='13' height='12' rx='2' />
      <path d='M16 10l5-3v10l-5-3z' />
    </svg>
  )
}

function RecordIcon() {
  return (
    <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round'>
      <rect x='2' y='4' width='20' height='14' rx='2' />
      <circle cx='12' cy='11' r='3' fill='currentColor' stroke='none' />
    </svg>
  )
}

function RingProgress({ value }) {
  const c = 2 * Math.PI * 26
  const offset = c - (c * value) / 100
  return (
    <svg width='68' height='68' viewBox='0 0 72 72'>
      <circle cx='36' cy='36' r='26' stroke='rgba(31,28,24,0.08)' strokeWidth='2' fill='none' />
      <circle cx='36' cy='36' r='26' stroke='var(--umber-500)' strokeWidth='2' fill='none'
        strokeDasharray={c} strokeDashoffset={offset} strokeLinecap='round'
        transform='rotate(-90 36 36)' style={{ transition: 'stroke-dashoffset 400ms ease' }} />
    </svg>
  )
}

function EmptyBlock({ hint }) {
  return (
    <div className='py-10 text-center'>
      <div className='mx-auto w-10 h-10 rounded-full border hairline-strong flex items-center justify-center text-ink-400 mb-3'>
        <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' strokeLinejoin='round'>
          <circle cx='12' cy='12' r='9' /><path d='M9 12h6' />
        </svg>
      </div>
      <div className='text-[12.5px] text-ink-400'>{hint}</div>
    </div>
  )
}

function SkillListSkeleton() {
  return (
    <ul className='divide-y divide-ink-900/[0.06]'>
      {[0, 1, 2, 3].map(i => (
        <li key={i} className='py-3.5 flex items-center gap-4'>
          <div className='w-8 h-8 rounded-lg bg-paper-200' />
          <div className='flex-1 space-y-2'>
            <div className='h-3 w-2/5 rounded bg-paper-200' />
            <div className='h-2.5 w-1/4 rounded bg-paper-200' />
          </div>
        </li>
      ))}
    </ul>
  )
}

function formatSize(bytes) {
  if (!bytes) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB']
  let s = bytes, i = 0
  while (s >= 1024 && i < u.length - 1) { s /= 1024; i++ }
  return `${s.toFixed(1)} ${u[i]}`
}
