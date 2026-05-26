import axios from 'axios'

const client = axios.create({
  baseURL: '/api',
  timeout: 120000,
})

client.interceptors.response.use(
  (res) => res.data,
  (err) => {
    const data = err.response?.data
    const msg = data?.message || err.message || 'Request failed'
    const error = new Error(msg)
    if (data?.code) error.code = data.code
    return Promise.reject(error)
  }
)

export const uploadVideo = (file, onProgress) => {
  const form = new FormData()
  form.append('file', file)
  return client.post('/videos/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => onProgress && onProgress(Math.round((e.loaded * 100) / e.total)),
  })
}

export const extractFramesAuto = (videoId, intervalSeconds = 3) =>
  client.post(`/videos/${videoId}/frames/auto`, { intervalSeconds })

export const extractFramesManual = (videoId, timestamps) =>
  client.post(`/videos/${videoId}/frames/manual`, { timestamps })

export const generateSkill = (payload) =>
  client.post('/skills/generate', payload)

export const getSkill = (skillId) =>
  client.get(`/skills/${skillId}`)

export const updateSkillFile = (skillId, path, content) =>
  client.put(`/skills/${skillId}/files`, { path, content })

export const getVideoStreamUrl = (videoId) =>
  `/api/videos/${videoId}/stream`

export const fetchSkillList = () =>
  client.get('/skills')

export const reorderSkills = (skillIds) =>
  client.put('/skills/order', { skillIds })

export const deleteSkill = (skillId) =>
  client.delete(`/skills/${skillId}`)

export const importSkill = (file, onProgress) => {
  const form = new FormData()
  form.append('file', file)
  return client.post('/skills/import', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => onProgress && e.total && onProgress(Math.round((e.loaded * 100) / e.total)),
  })
}

export const deploySkill = (skillId) =>
  client.post(`/skills/${skillId}/deploy`)

export const fetchAndroidDevices = () =>
  client.get('/devices/android')

export const fetchIosDevices = () =>
  client.get('/devices/ios')

// ==================== 归档 API ====================

// 视频归档
export const saveVideoArchive = (videoId, description) =>
  client.post('/archives/videos', { videoId, description })

export const fetchVideoArchives = () =>
  client.get('/archives/videos')

export const deleteVideoArchive = (id) =>
  client.delete(`/archives/videos/${id}`)

// 帧归档
export const saveFrameArchive = (data) =>
  client.post('/archives/frames', data)

export const fetchFrameArchives = () =>
  client.get('/archives/frames')

export const fetchFramesByVideo = (videoArchiveId) =>
  client.get(`/archives/frames/video/${videoArchiveId}`)

export const deleteFrameArchive = (id) =>
  client.delete(`/archives/frames/${id}`)

// 诉求历史
export const saveRequirement = (content, frameIds, platform) =>
  client.post('/archives/requirements', { content, frameIds, platform })

export const fetchRecentRequirements = () =>
  client.get('/archives/requirements/recent')

export const updateRequirementUseCount = (id) =>
  client.put(`/archives/requirements/${id}/use`)

// ==================== Prompt 模板 API ====================

export const fetchPromptTemplates = () =>
  client.get('/prompt-templates')

export const createPromptTemplate = (data) =>
  client.post('/prompt-templates', data)

export const deletePromptTemplate = (id) =>
  client.delete(`/prompt-templates/${id}`)

export const incrementTemplateUseCount = (id) =>
  client.post(`/prompt-templates/${id}/use`)

// ==================== Skill 重新生成 API ====================

export const regenerateSkill = (skillId, data) =>
  client.post(`/skills/${skillId}/regenerate`, data)

// 局部重新生成（支持选择图片和代码范围）
export const partialRegenerateSkill = async (skillId, params, onLog) => {
  // 创建 SSE 连接获取日志
  const sessionId = `partial_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  
  return new Promise((resolve, reject) => {
    // 先建立 SSE 连接
    const eventSource = new EventSource(`/api/skills/logs/${sessionId}`)
    
    eventSource.onmessage = (event) => {
      if (onLog) onLog(event.data)
    }
    
    eventSource.onerror = () => {
      // SSE 连接错误不直接 reject，让请求本身决定
    }
    
    // 发送请求
    client.post(`/skills/${skillId}/partial-regenerate`, { ...params, sessionId })
      .then(response => {
        eventSource.close()
        resolve(response)
      })
      .catch(error => {
        eventSource.close()
        reject(error)
      })
  })
}

export const acceptCandidate = (skillId) =>
  client.post(`/skills/${skillId}/accept`)

export const discardCandidate = (skillId) =>
  client.delete(`/skills/${skillId}/candidate`)

export const fetchSkillVersions = (skillId) =>
  client.get(`/skills/${skillId}/versions`)

// ==================== 进程管理 API ====================

// 一键终止所有 Midscene 相关进程
export const killAllMidsceneProcesses = () =>
  client.post('/skills/kill-all')

// ==================== 知识库 API ====================

export const fetchKnowledgeFiles = (skillId) =>
  client.get(`/skills/${skillId}/knowledge`)

export const uploadKnowledgeFile = (skillId, file, description, onProgress) => {
  const form = new FormData()
  form.append('file', file)
  if (description) form.append('description', description)
  return client.post(`/skills/${skillId}/knowledge`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => onProgress && e.total && onProgress(Math.round((e.loaded * 100) / e.total)),
  })
}

export const updateKnowledgeDescription = (skillId, fileName, description) =>
  client.put(`/skills/${skillId}/knowledge/${encodeURIComponent(fileName)}`, { description })

export const deleteKnowledgeFile = (skillId, fileName) =>
  client.delete(`/skills/${skillId}/knowledge/${encodeURIComponent(fileName)}`)

export const getKnowledgeDownloadUrl = (skillId, fileName) =>
  `/api/skills/${skillId}/knowledge/${encodeURIComponent(fileName)}/download`
