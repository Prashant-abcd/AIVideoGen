import { spawn } from 'child_process'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { createWriteStream } from 'fs'
import { pipeline } from 'stream/promises'
import RunwayML from '@runwayml/sdk'
import sharp from 'sharp'

// ffmpeg-static returns \ROOT\ when bundled by Next.js — construct path directly
const ffmpegPath = path.join(
  process.cwd(), 'node_modules', 'ffmpeg-static',
  process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg',
)

const SARVAM_BASE = 'https://api.sarvam.ai'
const RUNWAY_POLL_MS = 10_000
const TIMEOUT_MS = 15 * 60 * 1000

// gen4.5: best Runway model — text-to-video for genuine animation
const RUNWAY_MODEL = 'gen4.5'
// Runway generates 10s clips; we speed/slow to match Sarvam duration
const RUNWAY_CLIP_DURATION = 10

// Font for drawtext overlays
const FONT_PATH = process.platform === 'win32'
  ? 'C\\\\:/Windows/Fonts/arial.ttf'
  : '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'

// ── Scene parser ──────────────────────────────────────────────────────────────

function parseScenes(scriptText) {
  // Split into per-scene blocks at each [SCENE N: boundary
  const blocks = scriptText.split(/(?=\[SCENE\s+\d+:)/i).filter(s => s.trim())
  const scenes = blocks.map(block => {
    const numMatch = block.match(/\[SCENE\s+\d+:/i)
    if (!numMatch) return null

    // LABELS: line is the hard separator between visual and narration
    const labelLineMatch = block.match(/^LABELS:\s*(.+)$/m)
    if (!labelLineMatch) return null

    const labelPos = block.indexOf(labelLineMatch[0])
    const labels = labelLineMatch[1].split('|').map(s => s.trim()).filter(Boolean)

    // Visual = everything from after [SCENE N: header to the LABELS line
    // Strips [T=...] timing markers and stray ] characters
    const afterHeader = block.slice(numMatch.index + numMatch[0].length, labelPos)
    const visual = afterHeader
      .replace(/\[\s*T=[^\]]+\]/gi, '')
      .replace(/^\s*\]/, '')
      .replace(/\]\s*$/, '')
      .trim()

    // Narration = only the text after the LABELS line — this is what Sarvam TTS speaks
    const narration = block.slice(labelPos + labelLineMatch[0].length).trim()

    if (!visual || !narration) return null
    return { visual, narration, labels }
  }).filter(Boolean)

  if (!scenes.length) {
    scenes.push({ visual: 'bright educational diagram', narration: scriptText.trim(), labels: [] })
  }
  return scenes
}

// Build the Runway text prompt — pure visual animation, zero text
function buildRunwayPrompt(visual) {
  // Prefix: lock the style before the content description
  const prefix = 'Animated educational science diagram, flat 2D illustration style, bright solid colours, clean white or light blue background. '

  // Suffix: absolute prohibition on text — stated multiple ways so Runway cannot misunderstand
  const suffix = ' RENDER ONLY VISUAL ELEMENTS: shapes, arrows, molecules, cells, diagrams, colour fills, motion paths. ZERO TEXT POLICY — do not render any text, letters, words, numbers, symbols, equations, labels, captions, titles, watermarks, logos, or written characters of any kind anywhere in the frame. Not even a single letter. All information is conveyed purely through shapes, colours, arrows, and motion.'

  const budget = 950 - prefix.length - suffix.length
  let trimmed = visual.slice(0, budget)
  if (trimmed.length === budget) {
    const last = Math.max(trimmed.lastIndexOf('. '), trimmed.lastIndexOf('! '))
    if (last > budget * 0.6) trimmed = trimmed.slice(0, last + 1)
  }
  return prefix + trimmed + suffix
}

// ── Utilities ─────────────────────────────────────────────────────────────────

async function safeJson(res, label) {
  const text = await res.text()
  try { return JSON.parse(text) }
  catch { throw new Error(`${label} returned non-JSON (${res.status}): ${text.slice(0, 300)}`) }
}

async function downloadFile(url, destPath) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`)
  await pipeline(res.body, createWriteStream(destPath))
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    proc.stderr.on('data', d => { stderr += d })
    proc.on('close', code => {
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg exited ${code}:\n${stderr.slice(-3000)}`))
    })
  })
}

async function getAudioDurationSec(filePath) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, ['-i', filePath], { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    proc.stderr.on('data', d => { out += d })
    proc.on('close', () => {
      const m = out.match(/Duration:\s*(\d+):(\d+):([\d.]+)/)
      if (!m) return reject(new Error('Cannot parse duration'))
      resolve(parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3]))
    })
  })
}

// ── ffmpeg drawtext helpers ───────────────────────────────────────────────────

function escDrawtext(text) {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, '\u2019')
    .replace(/:/g, '\\:')
    .replace(/%/g, '%%')
}

function findLabelTiming(label, narrationWords) {
  const labelLower = label.toLowerCase().replace(/[^a-z0-9\s]/g, '')
  const keywords = labelLower.split(/\s+/).filter(w => w.length > 2)
  for (let i = 0; i < narrationWords.length; i++) {
    const word = narrationWords[i].toLowerCase().replace(/[^a-z0-9]/g, '')
    for (const kw of keywords) {
      if (word.includes(kw) || kw.includes(word)) return i / narrationWords.length
    }
  }
  return null
}

// ── LaTeX equation rendering (for maths subjects) ────────────────────────────

function isEquationLabel(label) {
  return label.startsWith('$') && label.endsWith('$')
}

async function renderEquationPNG(latex, outputPath) {
  const encoded = encodeURIComponent(latex)
  const url = `https://latex.codecogs.com/png.image?%5Cdpi%7B200%7D%5Ccolor%7Bwhite%7D${encoded}`
  console.log(`[LaTeX] Rendering: ${latex}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`LaTeX render failed (${res.status})`)
  const raw = Buffer.from(await res.arrayBuffer())
  const meta = await sharp(raw).metadata()
  const padX = 16, padY = 10
  const buf = await sharp({
    create: {
      width: meta.width + padX * 2,
      height: meta.height + padY * 2,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 128 },
    }
  })
    .composite([{ input: raw, left: padX, top: padY }])
    .png()
    .toBuffer()
  await fs.writeFile(outputPath, buf)
  return buf
}

// ── Label timing + filter builder ─────────────────────────────────────────────

function computeLabelTimings(labels, narration, duration) {
  const narrationWords = narration.trim().split(/\s+/)
  const totalLabels = labels.length
  const lineHeight = totalLabels <= 4 ? 55 : 44

  const timings = labels.map((raw, i) => {
    const searchText = isEquationLabel(raw) ? raw.slice(1, -1) : raw
    const fraction = findLabelTiming(searchText, narrationWords)
    if (fraction !== null) return Math.max(0, fraction * duration - 0.3)
    return (i / totalLabels) * duration * 0.8
  })

  const indexed = timings.map((t, i) => ({ t, i })).sort((a, b) => a.t - b.t)
  const slots = new Array(totalLabels)
  indexed.forEach((item, slotIdx) => { slots[item.i] = slotIdx })

  return labels.map((raw, i) => ({
    raw,
    isEquation: isEquationLabel(raw),
    appearAt: timings[i],
    y: 30 + slots[i] * lineHeight,
  }))
}

function buildTextLabelFilters(labelInfos) {
  const textLabels = labelInfos.filter(l => !l.isEquation)
  if (!textLabels.length) return ''
  const fontSize = labelInfos.length <= 4 ? 32 : 26
  const fadeInDur = 0.4
  const filters = textLabels.map(l => {
    const text = escDrawtext(l.raw)
    const appearAt = l.appearAt.toFixed(3)
    const fadeEnd = (l.appearAt + fadeInDur).toFixed(3)
    const enable = `enable='gte(t\\,${appearAt})'`
    const alpha = `alpha='if(lt(t\\,${fadeEnd})\\,(t-${appearAt})/${fadeInDur}\\,1)'`
    return `drawtext=fontfile='${FONT_PATH}':text='${text}':fontsize=${fontSize}:fontcolor=white:borderw=2:bordercolor=black:x=(w-tw)/2:y=${l.y}:box=1:boxcolor=black@0.5:boxborderw=6:${enable}:${alpha}`
  })
  return ',' + filters.join(',')
}

// ── Sarvam TTS ────────────────────────────────────────────────────────────────

/** Split text into chunks of max 490 chars at sentence boundaries */
function splitTextChunks(text, maxLen = 490) {
  const sentences = text.split(/(?<=[.!?।])\s+/)
  const chunks = []
  let current = ''
  for (const s of sentences) {
    if ((current + ' ' + s).trim().length > maxLen) {
      if (current) chunks.push(current.trim())
      current = s
    } else {
      current = current ? current + ' ' + s : s
    }
  }
  if (current) chunks.push(current.trim())
  return chunks.length ? chunks : [text.slice(0, maxLen)]
}

async function concatenateAudio(wavPaths, outputPath) {
  const listPath = outputPath + '-list.txt'
  const listContent = wavPaths.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n')
  await fs.writeFile(listPath, listContent, 'utf8')
  try {
    await runFfmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', outputPath])
  } finally {
    await fs.unlink(listPath).catch(() => {})
  }
}

async function generateSarvamAudio(text, apiKey, speaker, outputPath) {
  const chunks = splitTextChunks(text, 490)
  console.log(`[Sarvam] TTS: ${chunks.length} chunk(s)`)

  const chunkPaths = []
  for (let i = 0; i < chunks.length; i++) {
    const chunkPath = `${outputPath}-chunk-${i}.wav`
    const res = await fetch(`${SARVAM_BASE}/text-to-speech`, {
      method: 'POST',
      headers: { 'api-subscription-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inputs: [chunks[i]],
        target_language_code: 'en-IN',
        speaker,
        pace: 1.0,
        speech_sample_rate: 24000,
        enable_preprocessing: true,
        model: 'bulbul:v3',
      }),
    })
    if (!res.ok) throw new Error(`Sarvam TTS failed (${res.status}): ${await res.text()}`)
    const data = await safeJson(res, 'Sarvam TTS')
    await fs.writeFile(chunkPath, Buffer.from(data.audios[0], 'base64'))
    chunkPaths.push(chunkPath)
  }

  if (chunkPaths.length === 1) {
    await fs.rename(chunkPaths[0], outputPath)
    return
  }

  await concatenateAudio(chunkPaths, outputPath)
  for (const p of chunkPaths) {
    await fs.unlink(p).catch(() => {})
  }
}

// ── Runway text-to-video ──────────────────────────────────────────────────────

async function generateRunwayClip(visual, apiKey, sceneIdx) {
  const client = new RunwayML({ apiKey })
  const prompt = buildRunwayPrompt(visual)
  console.log(`[Runway] Scene ${sceneIdx}: text-to-video | "${prompt.slice(0, 80)}..."`)

  const task = await client.textToVideo.create({
    model: RUNWAY_MODEL,
    promptText: prompt,
    duration: RUNWAY_CLIP_DURATION,
    ratio: '1280:720',
  })
  console.log(`[Runway] Scene ${sceneIdx} task id: ${task.id}`)

  const deadline = Date.now() + TIMEOUT_MS
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, RUNWAY_POLL_MS))
    const status = await client.tasks.retrieve(task.id)
    console.log(`[Runway] Scene ${sceneIdx} status: ${status.status}`)
    if (status.status === 'SUCCEEDED') {
      const url = status.output?.[0]
      if (!url) throw new Error(`Runway scene ${sceneIdx}: no output URL`)
      return url
    }
    if (status.status === 'FAILED') {
      throw new Error(`Runway scene ${sceneIdx} failed: ${JSON.stringify(status.failure ?? status)}`)
    }
  }
  throw new Error(`Runway scene ${sceneIdx} timed out`)
}

// ── SRT caption generator ─────────────────────────────────────────────────────

function toSRTTime(sec) {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  const ms = Math.round((sec % 1) * 1000)
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(ms).padStart(3,'0')}`
}

function generateSRT(scenes, durations) {
  let srt = ''
  let idx = 1
  let elapsed = 0
  const WORDS_PER_SUB = 8
  for (let s = 0; s < scenes.length; s++) {
    const words = scenes[s].narration.trim().split(/\s+/)
    const dur = durations[s]
    const chunks = []
    for (let w = 0; w < words.length; w += WORDS_PER_SUB) {
      chunks.push(words.slice(w, w + WORDS_PER_SUB).join(' '))
    }
    const chunkDur = dur / chunks.length
    for (let c = 0; c < chunks.length; c++) {
      const start = elapsed + c * chunkDur
      const end = start + chunkDur - 0.04
      srt += `${idx}\n${toSRTTime(start)} --> ${toSRTTime(end)}\n${chunks[c]}\n\n`
      idx++
    }
    elapsed += dur
  }
  return srt
}

// ── ffmpeg assemble ───────────────────────────────────────────────────────────

async function assembleScene({ runwayPath, audioPath, sarvamDuration, outputPath, labels, narration, tmpDir, sceneIdx }) {
  const ptsScale = (sarvamDuration / RUNWAY_CLIP_DURATION).toFixed(6)
  const labelInfos = computeLabelTimings(labels, narration, sarvamDuration)
  const eqLabels = labelInfos.filter(l => l.isEquation)
  const textCount = labelInfos.filter(l => !l.isEquation).length
  console.log(`[Assemble] pts: ${ptsScale} | text: ${textCount} | equations: ${eqLabels.length}`)

  // Render any LaTeX equation PNGs
  const eqPaths = []
  for (let i = 0; i < eqLabels.length; i++) {
    const p = path.join(tmpDir, `eq_s${sceneIdx}_${i}.png`)
    await renderEquationPNG(eqLabels[i].raw.slice(1, -1), p)
    eqPaths.push(p)
  }

  const inputs = ['-i', runwayPath, '-i', audioPath]
  eqPaths.forEach(p => inputs.push('-i', p))

  const textFilters = buildTextLabelFilters(labelInfos)
  const fadeInDur = 0.4

  if (eqLabels.length === 0) {
    // Text-only labels via drawtext
    const fc = `[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,setpts=${ptsScale}*PTS${textFilters}[v]`
    await runFfmpeg(['-y', ...inputs, '-filter_complex', fc,
      '-map', '[v]', '-map', '1:a', '-t', sarvamDuration.toFixed(3),
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', outputPath])
  } else {
    // Drawtext for text labels + overlay for equation PNGs
    let fc = `[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,setpts=${ptsScale}*PTS${textFilters}[base]`
    let prevTag = 'base'
    for (let i = 0; i < eqLabels.length; i++) {
      const inputIdx = i + 2
      const eq = eqLabels[i]
      const at = eq.appearAt.toFixed(3)
      const nextTag = i === eqLabels.length - 1 ? 'v' : `eq${i}`
      fc += `;[${inputIdx}:v]fade=t=in:st=${at}:d=${fadeInDur}:alpha=1[eqf${i}]`
      fc += `;[${prevTag}][eqf${i}]overlay=x=(W-w)/2:y=${eq.y}:enable='gte(t\\,${at})'[${nextTag}]`
      prevTag = nextTag
    }
    await runFfmpeg(['-y', ...inputs, '-filter_complex', fc,
      '-map', '[v]', '-map', '1:a', '-t', sarvamDuration.toFixed(3),
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', outputPath])
  }
}

// ── Main provider ─────────────────────────────────────────────────────────────

export class KlingPipelineProvider {
  async render({ scriptText, contentItemId }) {
    const contentId = contentItemId
    const runwayKey = process.env.RUNWAY_API_KEY
    const sarvamKey = process.env.SARVAM_API_KEY

    if (!runwayKey) throw new Error('RUNWAY_API_KEY missing')
    if (!sarvamKey) throw new Error('SARVAM_API_KEY missing')

    const scenes = parseScenes(scriptText)
    const speaker = 'advait'

    console.log('\n[Pipeline] ════════════════════════════════════════════')
    console.log(`[Pipeline] ${scenes.length} scenes | model: ${RUNWAY_MODEL} (text-to-video)`)
    scenes.forEach((s, i) => {
      console.log(`[Pipeline] Scene ${i + 1}: "${s.visual.slice(0, 80)}"`)
      if (s.labels.length) console.log(`[Pipeline]   labels: ${s.labels.join(' | ')}`)
    })

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ncert-'))
    console.log(`[Pipeline] tmp: ${tmpDir} | ffmpeg: ${ffmpegPath}`)

    try {
      await runFfmpeg(['-version']).catch(e => {
        throw new Error(`ffmpeg not found at "${ffmpegPath}": ${e.message}`)
      })
      console.log('[Pipeline] ffmpeg OK')

      // ── STEP 1: Sarvam TTS ─────────────────────────────────────────────────
      console.log('\n[Pipeline] STEP 1/3 — Sarvam TTS per scene...')
      const audioPaths = []
      const sceneDurations = []
      for (let i = 0; i < scenes.length; i++) {
        const audioPath = path.join(tmpDir, `scene_${i}.wav`)
        await generateSarvamAudio(scenes[i].narration, sarvamKey, speaker, audioPath)
        const dur = await getAudioDurationSec(audioPath)
        audioPaths.push(audioPath)
        sceneDurations.push(dur)
        console.log(`[Sarvam] Scene ${i + 1}: ${dur.toFixed(2)}s`)
      }
      console.log(`[Pipeline] TTS done — total: ${sceneDurations.reduce((a, b) => a + b, 0).toFixed(2)}s`)

      // ── STEP 2: Runway text-to-video ───────────────────────────────────────
      console.log('\n[Pipeline] STEP 2/3 — Runway text-to-video (credits being spent)...')
      const runwayUrls = await Promise.all(
        scenes.map((scene, i) => generateRunwayClip(scene.visual, runwayKey, i + 1))
      )
      const runwayPaths = []
      for (let i = 0; i < runwayUrls.length; i++) {
        const p = path.join(tmpDir, `runway_scene${i + 1}.mp4`)
        await downloadFile(runwayUrls[i], p)
        console.log(`[Runway] Scene ${i + 1} downloaded`)
        runwayPaths.push(p)
      }

      // ── STEP 3: Assemble ───────────────────────────────────────────────────
      console.log('\n[Pipeline] STEP 3/3 — Assembling scenes...')
      const scenePaths = []
      for (let i = 0; i < scenes.length; i++) {
        const outPath = path.join(tmpDir, `scene_${i}_final.mp4`)
        await assembleScene({
          runwayPath: runwayPaths[i],
          audioPath: audioPaths[i],
          sarvamDuration: sceneDurations[i],
          outputPath: outPath,
          labels: scenes[i].labels,
          narration: scenes[i].narration,
          tmpDir,
          sceneIdx: i + 1,
        })
        scenePaths.push(outPath)
        console.log(`[Pipeline] Scene ${i + 1} assembled`)
      }

      // ── Save per-scene clips + metadata so SarvamTTSDubProvider can dub them ──
      const rendersDir = path.join(process.cwd(), 'public', 'renders')
      const clipsDir = path.join(rendersDir, 'clips')
      await fs.mkdir(clipsDir, { recursive: true })
      for (let i = 0; i < scenePaths.length; i++) {
        const clipDest = path.join(clipsDir, `${contentId}-scene-${i}.mp4`)
        await fs.copyFile(scenePaths[i], clipDest)
      }
      await fs.writeFile(
        path.join(rendersDir, `${contentId}-scenes.json`),
        JSON.stringify(scenes.map((s, i) => ({
          narration: s.narration,
          labels: s.labels,
          duration: sceneDurations[i],
        })), null, 2),
        'utf8',
      )
      console.log(`[Pipeline] Saved ${scenePaths.length} clips + metadata for dubbing`)

      // Concat
      const concatList = path.join(tmpDir, 'concat.txt')
      await fs.writeFile(concatList, scenePaths.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n'))

      const videosDir = path.join(process.cwd(), 'public', 'videos')
      await fs.mkdir(videosDir, { recursive: true })
      const finalPath = path.join(videosDir, `${contentId}.mp4`)

      const rawPath = path.join(tmpDir, 'raw.mp4')
      await runFfmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', concatList, '-c', 'copy', rawPath])

      // Burn SRT captions
      const srtPath = path.join(tmpDir, 'captions.srt')
      await fs.writeFile(srtPath, generateSRT(scenes, sceneDurations), 'utf8')
      console.log('[Pipeline] Burning captions...')
      const srtFfmpegPath = srtPath.replace(/\\/g, '/').replace(/^([A-Z]):/, '$1\\:')
      await runFfmpeg([
        '-y', '-i', rawPath,
        '-vf', `subtitles='${srtFfmpegPath}':force_style='FontSize=18,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2,Bold=1,MarginV=30,Alignment=2,WrapStyle=2'`,
        '-c:a', 'copy',
        finalPath,
      ])

      const finalDuration = await getAudioDurationSec(finalPath)
      console.log(`[Pipeline] Final: ${finalPath} (${finalDuration.toFixed(1)}s)`)
      console.log('[Pipeline] ════════════════════════════════════════════\n')

      return { jobId: contentId, fileUrl: `/videos/${contentId}.mp4`, durationSec: finalDuration }

    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
    }
  }
}
