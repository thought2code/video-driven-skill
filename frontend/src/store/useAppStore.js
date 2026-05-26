import { create } from 'zustand'

const useAppStore = create((set) => ({
  // ========== Video state ==========
  videoId: null,
  videoFilename: null,
  videoDuration: 0,
  setVideo: (videoId, filename, duration) => set({ videoId, videoFilename: filename, videoDuration: duration }),

  // ========== Frames state ==========
  frames: [], // { frameId, timestamp, base64Image, description, annotationJson }
  setFrames: (frames) => set({ frames }),
  addFrames: (newFrames) => set((s) => ({
    frames: [...s.frames, ...newFrames.filter(f => !s.frames.find(e => e.frameId === f.frameId))]
  })),
  updateFrameDescription: (frameId, description) => set((s) => ({
    frames: s.frames.map(f => f.frameId === frameId ? { ...f, description } : f)
  })),
  updateFrameAnnotation: (frameId, annotationJson) => set((s) => ({
    frames: s.frames.map(f => f.frameId === frameId ? { ...f, annotationJson } : f)
  })),
  updateFrameImage: (frameId, base64Image) => set((s) => ({
    frames: s.frames.map(f => f.frameId === frameId ? { ...f, base64Image } : f)
  })),
  removeFrame: (frameId) => set((s) => ({
    frames: s.frames.filter(f => f.frameId !== frameId)
  })),
  moveFrame: (frameId, direction) => set((s) => {
    const index = s.frames.findIndex(f => f.frameId === frameId)
    if (index === -1) return { frames: s.frames }

    const newIndex = direction === 'left' ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= s.frames.length) return { frames: s.frames }

    const newFrames = [...s.frames]
    const [removed] = newFrames.splice(index, 1)
    newFrames.splice(newIndex, 0, removed)
    return { frames: newFrames }
  }),
  reorderFrames: (newFrames) => set({ frames: newFrames }),

  // ========== Selected frame for annotation ==========
  selectedFrameId: null,
  setSelectedFrameId: (frameId) => set({ selectedFrameId: frameId }),

  // ========== Requirement ==========
  requirement: '',
  setRequirement: (requirement) => set({ requirement }),

  // ========== Skill state ==========
  skillId: null,
  skillName: null,
  skillFiles: [], // { name, path, content }
  skillVariables: [], // { name, label, defaultValue, type }
  setSkill: (skillId, skillName, files, variables = []) => set({ skillId, skillName, skillFiles: files, skillVariables: variables }),
  updateSkillFileContent: (path, content) => set((s) => ({
    skillFiles: s.skillFiles.map(f => f.path === path ? { ...f, content } : f)
  })),

  // ========== Skill list (history) ==========
  skillList: [],
  setSkillList: (list) => set({ skillList: list }),

  // ========== Active tab in playground ==========
  activeTab: 'annotate',
  setActiveTab: (tab) => set({ activeTab: tab }),

  // ========== AI loading ==========
  isGenerating: false,
  setIsGenerating: (v) => set({ isGenerating: v }),

  // ========== Regeneration state ==========
  regeneration: {
    isRegenerating: false,
    candidate: null, // { skillId, skillName, files, variables }
    iteration: 0,
    additionalPrompt: '',
  },

  setAdditionalPrompt: (text) => set((s) => ({
    regeneration: { ...s.regeneration, additionalPrompt: text }
  })),

  startRegeneration: () => set((s) => ({
    regeneration: { ...s.regeneration, isRegenerating: true }
  })),

  setRegenerationCandidate: (candidate, _history, iteration) => set((s) => ({
    regeneration: {
      ...s.regeneration,
      candidate,
      iteration,
      isRegenerating: false,
    }
  })),

  acceptCandidate: () => set((s) => {
    const { candidate } = s.regeneration
    if (!candidate) return s

    return {
      skillFiles: candidate.files,
      skillName: candidate.skillName,
      skillVariables: candidate.variables || [],
      regeneration: {
        ...s.regeneration,
        candidate: null,
        additionalPrompt: '',
      }
    }
  }),

  discardCandidate: () => set((s) => ({
    regeneration: {
      ...s.regeneration,
      candidate: null,
    }
  })),

  // ========== Reset for new session ==========
  reset: () => set({
    videoId: null, videoFilename: null, videoDuration: 0,
    frames: [], selectedFrameId: null, requirement: '',
    skillId: null, skillName: null, skillFiles: [], skillVariables: [],
    activeTab: 'annotate', isGenerating: false,
    regeneration: {
      isRegenerating: false,
      candidate: null,
      iteration: 0,
      additionalPrompt: '',
    }
  }),
}))

export default useAppStore
