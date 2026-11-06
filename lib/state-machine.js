import fs from 'fs/promises'
import path from 'path'
import { prisma } from './db.js'
import { llmProvider, renderProvider, dubProvider } from './providers/index.js'

// ---------------------------------------------------------------------------
// Transitions table — the single source of truth for the pipeline
// Each entry: { fromState, action, toState, allowedRole, sideEffect }
// allowedRole: null means the transition is fired by the system (not a user)
// ---------------------------------------------------------------------------
const TRANSITIONS = [
  // Happy path
  {
    fromState: 'DRAFT',
    action: 'submit',
    toState: 'SCRIPT_GENERATING',
    allowedRole: 'COORDINATOR',
    sideEffect: 'generateScript',
  },
  {
    fromState: 'SCRIPT_GENERATING',
    action: 'llm_complete',
    toState: 'SCRIPT_REVIEW',
    allowedRole: null, // system-fired
    sideEffect: 'createSMEReviewTask',
  },
  {
    fromState: 'SCRIPT_REVIEW',
    action: 'approve',
    toState: 'RENDERING',
    allowedRole: 'SME',
    sideEffect: 'startRender',
  },
  {
    fromState: 'RENDERING',
    action: 'render_complete',
    toState: 'PEDAGOGY_REVIEW',
    allowedRole: null, // system-fired
    sideEffect: 'createPedagogyTask',
  },
  {
    fromState: 'PEDAGOGY_REVIEW',
    action: 'approve',
    toState: 'DUBBING',
    allowedRole: 'PEDAGOGY',
    sideEffect: 'startDubbing',
  },
  {
    fromState: 'DUBBING',
    action: 'dubs_complete',
    toState: 'LANGUAGE_QC',
    allowedRole: null, // system-fired when all dub jobs finish
    sideEffect: 'createLanguageQCTasks',
  },
  {
    fromState: 'LANGUAGE_QC',
    action: 'all_approved',
    toState: 'FINAL_APPROVAL',
    allowedRole: null, // system-fired from approveOneLanguageQC
    sideEffect: 'createFinalApprovalTask',
  },
  {
    fromState: 'LANGUAGE_QC',
    action: 'approve',
    toState: 'LANGUAGE_QC', // stays until all languages approved
    allowedRole: 'SME',
    sideEffect: 'approveOneLanguageQC',
  },
  {
    fromState: 'FINAL_APPROVAL',
    action: 'approve',
    toState: 'PUBLISHED',
    allowedRole: 'APPROVER',
    sideEffect: 'publishItem',
  },

  // Rejection paths — return to previous editable state
  {
    fromState: 'SCRIPT_REVIEW',
    action: 'reject',
    toState: 'DRAFT',
    allowedRole: 'SME',
    sideEffect: 'closeTasks', // Coordinator sees card in DRAFT column, opens it, triggers regen
  },
  {
    fromState: 'PEDAGOGY_REVIEW',
    action: 'reject',
    toState: 'SCRIPT_REVIEW',
    allowedRole: 'PEDAGOGY',
    sideEffect: 'createSMEReviewTask',
  },
  {
    fromState: 'LANGUAGE_QC',
    action: 'reject',
    toState: 'DUBBING',
    allowedRole: 'SME',
    sideEffect: 'startDubbing',
  },
  {
    fromState: 'FINAL_APPROVAL',
    action: 'reject',
    toState: 'PEDAGOGY_REVIEW',
    allowedRole: 'APPROVER',
    sideEffect: 'createPedagogyTask',
  },

  // Retry paths — re-trigger failed async jobs
  {
    fromState: 'RENDERING',
    action: 'retry_render',
    toState: 'RENDERING',
    allowedRole: 'ANY',
    sideEffect: 'startRender',
  },
  {
    fromState: 'DUBBING',
    action: 'retry_dub',
    toState: 'DUBBING',
    allowedRole: 'ANY',
    sideEffect: 'startDubbing',
  },
  // Also allow retry from LANGUAGE_QC — in case item advanced despite failed dubs
  {
    fromState: 'LANGUAGE_QC',
    action: 'retry_dub',
    toState: 'DUBBING',
    allowedRole: 'ANY',
    sideEffect: 'startDubbing',
  },
]

// ---------------------------------------------------------------------------
// Side effects — called after state is committed to DB
// Each function receives { contentItem, actor, options }
// Long-running jobs (LLM, render, dub) fire async and call transition() again
// ---------------------------------------------------------------------------

async function closeTasks({ contentItem }) {
  await closeOpenTasksForItem(contentItem.id)
}

async function generateScript({ contentItem, actor, options }) {
  const chapter = await prisma.chapter.findUnique({
    where: { id: contentItem.chapterId },
  })

  const isRevision = !!options.comment
  console.log(`[LLM] ${isRevision ? 'Regenerating' : 'Generating'} script for "${contentItem.title}"`)

  // Fire async — does not block the HTTP response
  llmProvider
    .generateScript({
      chapterText: chapter.chapterText,
      learningOutcome: contentItem.learningOutcome,
      gradeLevel: contentItem.classLevel,
      format: contentItem.format,
      revisionNotes: options.comment ?? null,
    })
    .then(async ({ scriptText }) => {
      // Store script version
      const newVersion = contentItem.currentVersion + 1
      await prisma.scriptVersion.create({
        data: {
          contentItemId: contentItem.id,
          versionNo: newVersion,
          scriptText,
          generatedBy: 'LLM',
        },
      })
      await prisma.contentItem.update({
        where: { id: contentItem.id },
        data: { currentVersion: newVersion },
      })
      console.log(`[LLM] Script ready (v${newVersion}) for "${contentItem.title}" — advancing to SCRIPT_REVIEW`)
      // Advance state
      await transition(contentItem.id, 'llm_complete', null)
    })
    .catch((err) => {
      console.error('[LLM] Generation failed:', err)
      // Mark as failed so UI can show retry button
      prisma.contentItem
        .update({ where: { id: contentItem.id }, data: { state: 'DRAFT' } })
        .catch(console.error)
    })
}

async function createSMEReviewTask({ contentItem }) {
  await closeOpenTasksForItem(contentItem.id)
  await prisma.task.create({
    data: {
      contentItemId: contentItem.id,
      stage: 'SCRIPT_REVIEW',
      assignedRole: 'SME',
      status: 'OPEN',
    },
  })
}

async function startRender({ contentItem, actor, options }) {
  await closeOpenTasksForItem(contentItem.id)

  // Get the latest script version
  const latestScript = await prisma.scriptVersion.findFirst({
    where: { contentItemId: contentItem.id },
    orderBy: { versionNo: 'desc' },
  })

  // Create a PENDING RenderAsset for the master (EN)
  const asset = await prisma.renderAsset.create({
    data: {
      contentItemId: contentItem.id,
      versionNo: contentItem.currentVersion,
      language: 'EN',
      type: 'MASTER',
      provider: process.env.RUNWAY_API_KEY ? 'RUNWAY' : 'MOCK',
      status: 'PROCESSING',
    },
  })

  console.log(`[Runway] Starting scene-by-scene render for "${contentItem.title}"`)

  // Fire async render
  renderProvider
    .render({
      scriptText: latestScript.scriptText,
      contentItemId: contentItem.id,
    })
    .then(async ({ jobId, fileUrl, durationSec }) => {
      console.log(`[Runway] Render complete for "${contentItem.title}" — jobId: ${jobId}, url: ${fileUrl}`)
      await prisma.renderAsset.update({
        where: { id: asset.id },
        data: { providerJobId: jobId, fileUrl, durationSec, status: 'COMPLETED' },
      })
      await transition(contentItem.id, 'render_complete', null)
    })
    .catch(async (err) => {
      console.error('[Runway] Render failed:', err)
      await prisma.renderAsset.update({
        where: { id: asset.id },
        data: { status: 'FAILED' },
      })
    })
}

async function createPedagogyTask({ contentItem }) {
  await closeOpenTasksForItem(contentItem.id)
  await prisma.task.create({
    data: {
      contentItemId: contentItem.id,
      stage: 'PEDAGOGY_REVIEW',
      assignedRole: 'PEDAGOGY',
      status: 'OPEN',
    },
  })
}

/** Parse narration + labels per scene from raw scriptText (mirrors kling-pipeline parser) */
function extractScenesFromScript(scriptText) {
  const blocks = scriptText.split(/(?=\[SCENE\s+\d+:)/i).filter(s => s.trim())
  return blocks.map(block => {
    const numMatch = block.match(/\[SCENE\s+\d+:/i)
    if (!numMatch) return null
    const labelLineMatch = block.match(/^LABELS:\s*(.+)$/m)
    if (!labelLineMatch) return null
    const labelPos = block.indexOf(labelLineMatch[0])
    const labels = labelLineMatch[1].split('|').map(s => s.trim()).filter(Boolean)
    const narration = block.slice(labelPos + labelLineMatch[0].length).trim()
    return narration ? { narration, labels } : null
  }).filter(Boolean)
}

async function startDubbing({ contentItem }) {
  await closeOpenTasksForItem(contentItem.id)

  // Get the master render asset and latest script (needed for translation)
  const [masterAsset, latestScript] = await Promise.all([
    prisma.renderAsset.findFirst({
      where: { contentItemId: contentItem.id, type: 'MASTER', status: 'COMPLETED' },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.scriptVersion.findFirst({
      where: { contentItemId: contentItem.id },
      orderBy: { versionNo: 'desc' },
    }),
  ])

  if (!masterAsset) {
    console.error('[Dub] No completed master asset found for dubbing — aborting')
    return
  }

  // If scene metadata is missing (rendered before metadata-saving was added),
  // create a fallback from the master video — NO Runway credits spent.
  const rendersDir = path.join(process.cwd(), 'public', 'renders')
  const sceneMetaPath = path.join(rendersDir, `${contentItem.id}-scenes.json`)
  const metaExists = await fs.access(sceneMetaPath).then(() => true).catch(() => false)

  if (!metaExists && latestScript) {
    console.warn(`[Dub] Scene metadata missing for "${contentItem.title}" — building fallback from master video (no re-render needed)`)
    const masterVideoPath = path.join(process.cwd(), 'public', 'videos', `${contentItem.id}.mp4`)
    const clipsDir = path.join(rendersDir, 'clips')
    await fs.mkdir(clipsDir, { recursive: true })
    // Copy master video as a single scene clip
    await fs.copyFile(masterVideoPath, path.join(clipsDir, `${contentItem.id}-scene-0.mp4`))
    // Combine all scene narrations into one and use whole video as scene 0
    const parsedScenes = extractScenesFromScript(latestScript.scriptText)
    const fullNarration = parsedScenes.map(s => s.narration).join(' ')
    const allLabels = [...new Set(parsedScenes.flatMap(s => s.labels))]
    await fs.mkdir(rendersDir, { recursive: true })
    await fs.writeFile(sceneMetaPath, JSON.stringify([{
      narration: fullNarration,
      labels: allLabels,
      duration: masterAsset.durationSec ?? 30,
    }], null, 2), 'utf8')
    console.log(`[Dub] Fallback metadata created — 1 scene, ${fullNarration.split(' ').length} words`)
  }

  console.log(`[SarvamTTS] Starting dub for "${contentItem.title}" — languages: ${contentItem.targetLanguages.join(', ')}`)

  // Create PENDING dub assets for each target language
  const dubAssets = await Promise.all(
    contentItem.targetLanguages.map((lang) =>
      prisma.renderAsset.create({
        data: {
          contentItemId: contentItem.id,
          versionNo: contentItem.currentVersion,
          language: lang,
          type: 'DUB',
          provider: process.env.SARVAM_API_KEY ? 'SARVAM_TTS' : 'MOCK',
          status: 'PROCESSING',
        },
      })
    )
  )

  // Fire all dub jobs — only advance state if ALL succeed
  const results = await Promise.all(
    dubAssets.map(async (dubAsset) => {
      try {
        console.log(`[SarvamTTS] Starting dub for ${dubAsset.language}…`)
        const { jobId, fileUrl, durationSec } = await dubProvider.dub({
          contentItemId: contentItem.id,
          language: dubAsset.language,
        })
        console.log(`[SarvamTTS] Dub complete for ${dubAsset.language} — url: ${fileUrl}`)
        await prisma.renderAsset.update({
          where: { id: dubAsset.id },
          data: { providerJobId: jobId, fileUrl, durationSec, status: 'COMPLETED' },
        })
        return true
      } catch (err) {
        console.error(`[Dub] Failed for ${dubAsset.language}:`, err)
        await prisma.renderAsset.update({
          where: { id: dubAsset.id },
          data: { status: 'FAILED' },
        })
        return false
      }
    })
  )

  if (results.every(Boolean)) {
    await transition(contentItem.id, 'dubs_complete', null)
  } else {
    console.error(`[Dub] Some dubs failed for "${contentItem.title}" — item stays in DUBBING for retry`)
  }
}

async function createLanguageQCTasks({ contentItem }) {
  await closeOpenTasksForItem(contentItem.id)
  // One task per target language
  await Promise.all(
    contentItem.targetLanguages.map((lang) =>
      prisma.task.create({
        data: {
          contentItemId: contentItem.id,
          stage: `LANGUAGE_QC_${lang}`,
          assignedRole: 'SME',
          status: 'OPEN',
        },
      })
    )
  )
}

async function createFinalApprovalTask({ contentItem }) {
  await closeOpenTasksForItem(contentItem.id)
  await prisma.task.create({
    data: {
      contentItemId: contentItem.id,
      stage: 'FINAL_APPROVAL',
      assignedRole: 'APPROVER',
      status: 'OPEN',
    },
  })
}

async function publishItem({ contentItem }) {
  await closeOpenTasksForItem(contentItem.id)
  // YouTube links are attached manually — nothing to fire here for the demo
}

async function approveOneLanguageQC({ contentItem, actor, options }) {
  // Close only the specific language task (e.g. LANGUAGE_QC_HI)
  if (options.taskId) {
    await prisma.task.update({
      where: { id: options.taskId },
      data: { status: 'DONE', completedAt: new Date() },
    })
  }

  // Check if all per-language QC tasks are now done
  const remaining = await prisma.task.count({
    where: {
      contentItemId: contentItem.id,
      stage: { startsWith: 'LANGUAGE_QC_' },
      status: 'OPEN',
    },
  })

  if (remaining === 0) {
    // All languages approved — advance to FINAL_APPROVAL
    await transition(contentItem.id, 'all_approved', null)
  }
}

// ---------------------------------------------------------------------------
// Helper: close all open tasks for a content item
// ---------------------------------------------------------------------------
async function closeOpenTasksForItem(contentItemId) {
  await prisma.task.updateMany({
    where: { contentItemId, status: 'OPEN' },
    data: { status: 'DONE', completedAt: new Date() },
  })
}

// ---------------------------------------------------------------------------
// Side effect dispatcher
// ---------------------------------------------------------------------------
const SIDE_EFFECTS = {
  closeTasks,
  generateScript,
  createSMEReviewTask,
  startRender,
  createPedagogyTask,
  startDubbing,
  createLanguageQCTasks,
  createFinalApprovalTask,
  publishItem,
  approveOneLanguageQC,
}

// ---------------------------------------------------------------------------
// transition() — the one function all pipeline movement goes through
//
// contentItemId : string
// action        : string (e.g. 'submit', 'approve', 'reject', 'llm_complete')
// actorId       : string | null (null for system-fired transitions)
// options       : { comment, scriptText } — optional
// ---------------------------------------------------------------------------
export async function transition(contentItemId, action, actorId, options = {}) {
  const contentItem = await prisma.contentItem.findUnique({
    where: { id: contentItemId },
  })

  if (!contentItem) throw new Error(`ContentItem ${contentItemId} not found`)

  // Find matching transition rule
  const rule = TRANSITIONS.find(
    (t) => t.fromState === contentItem.state && t.action === action
  )

  if (!rule) {
    throw new Error(
      `No transition found: ${contentItem.state} + action "${action}"`
    )
  }

  // Role check (skip for system transitions where allowedRole is null)
  if (rule.allowedRole && actorId) {
    if (rule.allowedRole !== 'ANY') {
      const actor = await prisma.user.findUnique({ where: { id: actorId } })
      if (!actor || actor.role !== rule.allowedRole) {
        throw new Error(
          `Role mismatch: action "${action}" requires ${rule.allowedRole}, got ${actor?.role}`
        )
      }
    }
  }

  // Commit state change
  const updated = await prisma.contentItem.update({
    where: { id: contentItemId },
    data: { state: rule.toState },
  })

  // Write AuditEvent
  await prisma.auditEvent.create({
    data: {
      contentItemId,
      actorId: actorId ?? (await getSystemUserId()),
      action,
      fromState: rule.fromState,
      toState: rule.toState,
      comment: options.comment ?? null,
    },
  })

  // Fire side effect (non-blocking for long-running jobs)
  if (rule.sideEffect && SIDE_EFFECTS[rule.sideEffect]) {
    SIDE_EFFECTS[rule.sideEffect]({
      contentItem: updated,
      actor: actorId,
      options,
    }).catch((err) => console.error(`Side effect "${rule.sideEffect}" failed:`, err))
  }

  return updated
}

// ---------------------------------------------------------------------------
// Helper: get or create a system user for audit events fired without a human
// ---------------------------------------------------------------------------
let _systemUserId = null
async function getSystemUserId() {
  if (_systemUserId) return _systemUserId
  const sys = await prisma.user.findFirst({ where: { email: 'system@demo' } })
  if (sys) {
    _systemUserId = sys.id
    return _systemUserId
  }
  const created = await prisma.user.create({
    data: { name: 'System', email: 'system@demo', role: 'COORDINATOR' },
  })
  _systemUserId = created.id
  return _systemUserId
}
