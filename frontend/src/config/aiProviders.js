/** OpenAI-compatible vision providers; locale picks the preset list. */

export const AI_PROVIDER_STORAGE_KEY = 'vds.aiProviderId'

const SERVER = {
  id: 'server',
  nameKey: 'aiProcessor.providers.server.name',
  hintKey: 'aiProcessor.providers.server.hint',
  baseUrl: '',
  models: [],
}

const CUSTOM = {
  id: 'custom',
  nameKey: 'aiProcessor.providers.custom.name',
  hintKey: 'aiProcessor.providers.custom.hint',
  baseUrl: '',
  models: [],
  isCustom: true,
}

/** @typedef {{ id: string, nameKey: string, labelKey: string }} VisionModel */
/** @typedef {{ id: string, nameKey: string, hintKey?: string, keyUrl?: string, baseUrl: string, models: VisionModel[], isCustom?: boolean }} AiProvider */

/** @type {AiProvider[]} */
const AI_PROVIDERS_EN = [
  CUSTOM,
  SERVER,
  {
    id: 'google',
    nameKey: 'aiProcessor.providers.google.name',
    hintKey: 'aiProcessor.providers.google.hint',
    keyUrl: 'https://aistudio.google.com/apikey',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    models: [
      { id: 'gemini-2.0-flash', labelKey: 'aiProcessor.models.google.gemini20Flash' },
      { id: 'gemini-2.5-flash', labelKey: 'aiProcessor.models.google.gemini25Flash' },
      { id: 'gemini-1.5-pro', labelKey: 'aiProcessor.models.google.gemini15Pro' },
    ],
  },
  {
    id: 'openai',
    nameKey: 'aiProcessor.providers.openai.name',
    hintKey: 'aiProcessor.providers.openai.hint',
    keyUrl: 'https://platform.openai.com/api-keys',
    baseUrl: 'https://api.openai.com/v1',
    models: [
      { id: 'gpt-4o', labelKey: 'aiProcessor.models.openai.gpt4o' },
      { id: 'gpt-4o-mini', labelKey: 'aiProcessor.models.openai.gpt4oMini' },
    ],
  },
  {
    id: 'anthropic',
    nameKey: 'aiProcessor.providers.anthropic.name',
    hintKey: 'aiProcessor.providers.anthropic.hint',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    baseUrl: 'https://api.anthropic.com/v1',
    models: [
      { id: 'claude-sonnet-4-6', labelKey: 'aiProcessor.models.anthropic.sonnet46' },
      { id: 'claude-opus-4-7', labelKey: 'aiProcessor.models.anthropic.opus47' },
      { id: 'claude-3-5-haiku-20241022', labelKey: 'aiProcessor.models.anthropic.haiku35' },
    ],
  },
]

/** Maps saved provider ids from older builds. */
const LEGACY_PROVIDER_ALIASES = {
  qwen: 'aliyun',
}

/** @type {AiProvider[]} */
const AI_PROVIDERS_ZH = [
  CUSTOM,
  SERVER,
  {
    id: 'deepseek',
    nameKey: 'aiProcessor.providers.deepseek.name',
    hintKey: 'aiProcessor.providers.deepseek.hint',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    baseUrl: 'https://api.deepseek.com',
    models: [
      { id: 'deepseek-v4-flash', labelKey: 'aiProcessor.models.deepseek.v4Flash' },
      { id: 'deepseek-v4-pro', labelKey: 'aiProcessor.models.deepseek.v4Pro' },
    ],
  },
  {
    id: 'zhipu',
    nameKey: 'aiProcessor.providers.zhipu.name',
    hintKey: 'aiProcessor.providers.zhipu.hint',
    keyUrl: 'https://open.bigmodel.cn/usercenter/proj-mgmt/apikeys',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: [
      { id: 'glm-4.5v', labelKey: 'aiProcessor.models.zhipu.glm45v' },
      { id: 'glm-4v-plus', labelKey: 'aiProcessor.models.zhipu.glm4vPlus' },
      { id: 'glm-4v-flash', labelKey: 'aiProcessor.models.zhipu.glm4vFlash' },
    ],
  },
  {
    id: 'moonshot',
    nameKey: 'aiProcessor.providers.moonshot.name',
    hintKey: 'aiProcessor.providers.moonshot.hint',
    keyUrl: 'https://platform.moonshot.cn/console/api-keys',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: [
      { id: 'moonshot-v1-32k-vision-preview', labelKey: 'aiProcessor.models.moonshot.v32kVision' },
      { id: 'moonshot-v1-8k-vision-preview', labelKey: 'aiProcessor.models.moonshot.v8kVision' },
    ],
  },
  {
    id: 'doubao',
    nameKey: 'aiProcessor.providers.doubao.name',
    hintKey: 'aiProcessor.providers.doubao.hint',
    keyUrl: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    models: [
      { id: 'doubao-seed-1-6-vision-250815', labelKey: 'aiProcessor.models.doubao.seed16Vision' },
      { id: 'doubao-1-5-vision-pro-32k', labelKey: 'aiProcessor.models.doubao.visionPro15' },
      { id: 'doubao-1-5-vision-lite-32k', labelKey: 'aiProcessor.models.doubao.visionLite15' },
    ],
  },
  {
    id: 'aliyun',
    nameKey: 'aiProcessor.providers.aliyun.name',
    hintKey: 'aiProcessor.providers.aliyun.hint',
    keyUrl: 'https://bailian.console.aliyun.com/?tab=model#/api-key',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: [
      { id: 'qwen3-vl-plus', labelKey: 'aiProcessor.models.aliyun.qwen3VlPlus' },
      { id: 'qwen-vl-max', labelKey: 'aiProcessor.models.aliyun.vlMax' },
      { id: 'qwen2.5-vl-72b-instruct', labelKey: 'aiProcessor.models.aliyun.vl72b' },
    ],
  },
]

/**
 * @param {boolean} isZh
 * @returns {AiProvider[]}
 */
export function getAiProviders(isZh) {
  return isZh ? AI_PROVIDERS_ZH : AI_PROVIDERS_EN
}

/**
 * @param {AiProvider[]} providers
 * @param {string} providerId
 * @returns {AiProvider | undefined}
 */
export function findAiProvider(providers, providerId) {
  return providers.find(p => p.id === providerId)
}

/**
 * @param {AiProvider} provider
 * @param {string} modelId
 * @returns {boolean}
 */
export function providerHasModel(provider, modelId) {
  return provider.models.some(m => m.id === modelId)
}

/**
 * @param {AiProvider[]} providers
 * @param {string} [savedProviderId]
 * @param {string} [savedBaseUrl]
 * @param {string} [savedModel]
 */
export function resolveInitialAiSelection(providers, savedProviderId, savedBaseUrl, savedModel) {
  let providerId = savedProviderId || ''
  if (LEGACY_PROVIDER_ALIASES[providerId]) {
    providerId = LEGACY_PROVIDER_ALIASES[providerId]
  }
  if (!providerId && (savedBaseUrl?.trim() || savedModel?.trim())) {
    providerId = 'custom'
  }
  if (!findAiProvider(providers, providerId)) {
    providerId = 'server'
  }

  const provider = findAiProvider(providers, providerId)
  if (!provider || providerId === 'server') {
    return { providerId: 'server', baseUrl: '', model: '' }
  }
  if (provider.isCustom) {
    return {
      providerId: 'custom',
      baseUrl: savedBaseUrl?.trim() || '',
      model: savedModel?.trim() || '',
    }
  }

  const model = savedModel && providerHasModel(provider, savedModel)
    ? savedModel
    : provider.models[0]?.id || ''

  return {
    providerId,
    baseUrl: provider.baseUrl,
    model,
  }
}
