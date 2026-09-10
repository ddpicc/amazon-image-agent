const STUCK_THRESHOLD_MS = 15 * 60 * 1000

interface DiagnosticAttempt {
  status: string
  errorMessage: string | null
}

interface DiagnosticOperation {
  kind: string
  status: string
  createdAt: Date | string
  errorMessage: string | null
  attempts: DiagnosticAttempt[]
  imageGenerationRequest?: {
    status: string
    statusMessage: string | null
    errorMessage: string | null
    workerJobId: string | null
  } | null
  analysisRecord?: {
    status: string
    errorMessage: string | null
  } | null
}

export type DiagnosticTone = 'success' | 'danger' | 'warning' | 'progress'

export interface OperationDiagnostic {
  label: string
  tone: DiagnosticTone
  needsAttention: boolean
  stage: string
  error: string | null
  hint: string
}

function getFailureStage(operation: DiagnosticOperation, lastFailedAttempt: DiagnosticAttempt | null) {
  if (lastFailedAttempt) {
    return 'Provider 调用'
  }

  const imageStatus = operation.imageGenerationRequest?.statusMessage || ''
  if (imageStatus.includes('同步远端任务状态失败')) return 'Worker 状态同步'
  if (operation.kind === 'IMAGE_GENERATION') {
    return operation.imageGenerationRequest?.workerJobId ? '远端生图处理' : '本地校验 / 任务提交'
  }
  if (operation.kind === 'ANALYSIS') return '分析处理'
  return '未知阶段'
}

function getDiagnosticHint(error: string | null, stage: string, status: string) {
  if (!error) {
    if (status === 'FAILED') return '操作已标记失败，但没有保存错误详情，需要检查服务端日志。'
    if (status === 'STARTED') return '操作长时间未完成，优先检查任务队列、Worker 回调和状态同步。'
    return '未记录异常。'
  }

  const normalized = error.toLowerCase()
  if (normalized.includes('no pricing configured')) {
    return '模型与输出尺寸缺少积分价格配置，属于本地配置问题。'
  }
  if (normalized.includes('unsupported size')) {
    return '请求的图片尺寸不受当前模型支持，请核对模型尺寸配置。'
  }
  if (normalized.includes('no valid text provider') || normalized.includes('没有可用的文本模型')) {
    return '没有可用的文本 Provider，请检查启用状态、优先级和冷却时间。'
  }
  if (/\b401\b|unauthori[sz]ed|invalid api key|api key/.test(normalized)) {
    return '上游 Provider 鉴权失败，请检查 API Key 是否有效。'
  }
  if (/\b403\b|forbidden/.test(normalized)) {
    return '上游 Provider 拒绝访问，请检查账号或模型权限。'
  }
  if (/\b429\b|rate limit|quota/.test(normalized)) {
    return '上游 Provider 限流或额度不足，请检查配额和调用频率。'
  }
  if (/timeout|timed out|abort/.test(normalized)) {
    return '请求超时或被中止，请结合耗时和 Provider 状态排查。'
  }
  if (/reference.*fetch|fetch.*reference/.test(normalized)) {
    return '参考图片拉取失败，请检查图片地址、访问权限和网络连通性。'
  }
  if (stage.includes('Worker') || /callback|同步远端/.test(error)) {
    return '优先检查 image worker、回调地址和任务状态同步。'
  }
  return '这是系统记录到的原始异常；请结合失败阶段、Provider、模型和关联任务状态进一步判断。'
}

export function getOperationDiagnostic(operation: DiagnosticOperation, now = Date.now()): OperationDiagnostic {
  const failedAttempts = operation.attempts.filter((attempt) => attempt.status === 'FAILED')
  const lastFailedAttempt = failedAttempts.length > 0 ? failedAttempts[failedAttempts.length - 1] : null
  const error = operation.errorMessage
    || operation.imageGenerationRequest?.errorMessage
    || operation.analysisRecord?.errorMessage
    || lastFailedAttempt?.errorMessage
    || null
  const stage = getFailureStage(operation, lastFailedAttempt)
  const createdAt = new Date(operation.createdAt).getTime()
  const isStale = operation.status === 'STARTED'
    && Number.isFinite(createdAt)
    && now - createdAt > STUCK_THRESHOLD_MS

  if (operation.status === 'FAILED') {
    return {
      label: '失败',
      tone: 'danger',
      needsAttention: true,
      stage,
      error,
      hint: getDiagnosticHint(error, stage, operation.status),
    }
  }

  if (isStale) {
    return {
      label: '疑似卡住',
      tone: 'warning',
      needsAttention: true,
      stage: '长时间未完成',
      error: error || '超过 15 分钟仍未完成',
      hint: getDiagnosticHint(error, stage, operation.status),
    }
  }

  if (operation.status === 'STARTED') {
    return {
      label: '进行中',
      tone: 'progress',
      needsAttention: false,
      stage: '处理中',
      error: null,
      hint: '操作仍在进行中。',
    }
  }

  if (failedAttempts.length > 0) {
    return {
      label: '重试后成功',
      tone: 'warning',
      needsAttention: true,
      stage: getFailureStage(operation, lastFailedAttempt),
      error,
      hint: '最终成功，但至少一次 Provider 尝试失败，可检查是否存在不稳定或配置问题。',
    }
  }

  return {
    label: '成功',
    tone: 'success',
    needsAttention: false,
    stage: '无异常',
    error: null,
    hint: '未记录异常。',
  }
}

export function formatOperationKind(kind: string) {
  if (kind === 'IMAGE_GENERATION') return '生图'
  if (kind === 'ANALYSIS') return '分析 / Prompt'
  return kind
}

export function formatOperationSource(sourcePage: string | null) {
  if (sourcePage === 'amazon') return '亚马逊图片工作流'
  if (sourcePage === 'playground') return '自由生图'
  if (sourcePage === 'competitor-strategy') return '竞品图片策略分析'
  return sourcePage || '-'
}

export function getDiagnosticToneClass(tone: DiagnosticTone) {
  if (tone === 'danger') return 'bg-rose-50 text-rose-700 ring-rose-200'
  if (tone === 'warning') return 'bg-amber-50 text-amber-700 ring-amber-200'
  if (tone === 'progress') return 'bg-blue-50 text-blue-700 ring-blue-200'
  return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
}
