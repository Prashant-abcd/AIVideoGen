// Sarvam TTS dub provider
// For each target language:
//   1. Read scene clip paths saved by the render step
//   2. Translate narrations via Sarvam translate
//   3. Generate TTS audio per scene via Sarvam bulbul:v3
//   4. Mux each scene clip with language audio + concat
//   5. Burn translated SRT captions → dubbed mp4 in public/renders/

import { spawn } from 'child_process'
import ffmpegStatic from 'ffmpeg-static'
import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

// Use same path resolution as kling-pipeline to avoid Windows bundling issues
const ffmpegBin = path.join(
  process.cwd(), 'node_modules', 'ffmpeg-static',
  process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg',
)
ffmpeg.setFfmpegPath(ffmpegBin)
// Point fluent-ffmpeg's ffprobe to the same ffmpeg binary so it never throws "Cannot find ffprobe"
ffmpeg.setFfprobePath(ffmpegBin)

const SARVAM_BASE = 'https://api.sarvam.ai'

// Language code + voice mapping for Sarvam TTS
const LANG_CONFIG = {
  HI: { code: 'hi-IN', speaker: 'advait' },
  TA: { code: 'ta-IN', speaker: 'advait' },
  BN: { code: 'bn-IN', speaker: 'advait' },
  MR: { code: 'mr-IN', speaker: 'advait' },
  EN: { code: 'en-IN', speaker: 'advait' },
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Replace English scientific keywords with opaque placeholders before translation.
 * Sarvam will not translate placeholder tokens, so English terms survive intact.
 * Returns { text, map } where map is { placeholder → original English word }.
 */
function protectEnglishKeywords(narration, labels) {
  const map = {}
  let text = narration
  labels.forEach((label, idx) => {
    // Skip LaTeX equation labels — they don't appear in narration as text
    if (label.startsWith('$')) return
    // Extract first meaningful English word from label (drop symbols/subscripts)
    const keyword = label.replace(/[^\w\s]/g, ' ').trim().split(/\s+/)[0]
    if (!keyword || keyword.length < 3) return
    const ph = `__K${idx}__`
    // Match keyword and common suffixes (plural, past tense, etc.)
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`\\b${escaped}(?:s|es|ed|ing)?\\b`, 'gi')
    text = text.replace(re, (match) => {
      map[ph] = match  // save original casing/form
      return ph
    })
  })
  return { text, map }
}

/** Restore placeholders back to their original English keywords. */
function restoreEnglishKeywords(translatedText, map) {
  let result = translatedText
  for (const [ph, original] of Object.entries(map)) {
    result = result.split(ph).join(original)
  }
  return result
}

/** Translate narration text to target language via Sarvam translate API.
 *  Scientific keywords in `labels` are kept in English even in the translation. */
async function translateText(text, targetLangCode, labels = []) {
  // Protect English keywords before sending to translator
  const { text: protected_, map } = protectEnglishKeywords(text, labels)
  const chunks = splitIntoChunks(protected_, 950)
  const translated = await Promise.all(
    chunks.map((chunk) => translateChunk(chunk, targetLangCode))
  )
  const joined = translated.join(' ')
  // Restore English keywords back into the translated text
  return restoreEnglishKeywords(joined, map)
}

function splitIntoChunks(text, maxLen) {
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
  return chunks.length ? chunks : [text]
}

async function translateChunk(text, targetLangCode) {
  console.log(`[Translate→${targetLangCode}] Chunk (${text.length} chars): "${text.slice(0, 60)}…"`)
  const res = await fetch(`${SARVAM_BASE}/translate`, {
    method: 'POST',
    headers: {
      'api-subscription-key': process.env.SARVAM_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: text,
      source_language_code: 'en-IN',
      target_language_code: targetLangCode,
      speaker_gender: 'Female',
      mode: 'formal',
      model: 'mayura:v1',
      enable_preprocessing: true,
    }),
  })
  if (!res.ok) throw new Error(`Sarvam translate failed (${res.status}): ${await res.text()}`)
  const { translated_text } = await res.json()
  console.log(`[Translate→${targetLangCode}] ✓ Result: "${translated_text.slice(0, 60)}…"`)
  return translated_text
}

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

/** Concatenate wav files into one using ffmpeg concat demuxer */
function concatenateAudio(wavPaths, outputPath) {
  const listPath = outputPath + '-list.txt'
  const listContent = wavPaths.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n')
  return fs.writeFile(listPath, listContent).then(() =>
    new Promise((resolve, reject) => {
      ffmpeg()
        .input(listPath)
        .inputOptions(['-f concat', '-safe 0'])
        .outputOptions(['-c copy', '-y'])
        .output(outputPath)
        .on('end', () => fs.unlink(listPath).catch(() => {}).then(resolve))
        .on('error', reject)
        .run()
    })
  )
}

/** Generate TTS audio for text in the given language. Returns local .wav path. */
async function generateTTS(text, langConfig, index, tmpDir) {
  const chunks = splitTextChunks(text)
  console.log(`[TTS-${langConfig.code}] Scene ${index + 1}: ${chunks.length} chunk(s)`)

  const chunkBuffers = []
  for (let c = 0; c < chunks.length; c++) {
    const res = await fetch(`${SARVAM_BASE}/text-to-speech`, {
      method: 'POST',
      headers: {
        'api-subscription-key': process.env.SARVAM_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: [chunks[c]],
        target_language_code: langConfig.code,
        speaker: langConfig.speaker,
        model: 'bulbul:v3',
        enable_preprocessing: true,
      }),
    })
    if (!res.ok) throw new Error(`Sarvam TTS failed (${res.status}): ${await res.text()}`)
    const { audios } = await res.json()
    if (!audios?.length) throw new Error('Sarvam TTS returned no audio')
    chunkBuffers.push(Buffer.from(audios[0], 'base64'))
  }

  if (chunkBuffers.length === 1) {
    const audioPath = path.join(tmpDir, `audio-${index}.wav`)
    await fs.writeFile(audioPath, chunkBuffers[0])
    console.log(`[TTS-${langConfig.code}] Scene ${index + 1}: ✓ audio saved`)
    return audioPath
  }

  const chunkPaths = []
  for (let c = 0; c < chunkBuffers.length; c++) {
    const p = path.join(tmpDir, `audio-${index}-chunk-${c}.wav`)
    await fs.writeFile(p, chunkBuffers[c])
    chunkPaths.push(p)
  }
  const audioPath = path.join(tmpDir, `audio-${index}.wav`)
  await concatenateAudio(chunkPaths, audioPath)
  console.log(`[TTS-${langConfig.code}] Scene ${index + 1}: ✓ ${chunks.length} chunks merged`)
  return audioPath
}

/** Mux a video clip with an audio file, extending/trimming video to match audio duration. */
async function muxClipWithAudio(videoPath, audioPath, outputPath, audioDurSec) {
  console.log(`[FFmpeg] Muxing: ${path.basename(videoPath)} + ${path.basename(audioPath)}`)
  const videoDur = await getAudioDurationSec(videoPath)
  const pad = audioDurSec - videoDur

  return new Promise((resolve, reject) => {
    const cmd = ffmpeg()
      .input(videoPath)
      .input(audioPath)

    if (pad > 0.05) {
      // Audio longer than video — pad last frame to fill
      cmd.videoFilter(`tpad=stop_mode=clone:stop_duration=${pad.toFixed(3)}`)
      cmd.outputOptions(['-map 0:v:0', '-map 1:a:0', '-c:a aac', '-y'])
    } else {
      // Video longer or equal — trim to audio length
      cmd.outputOptions(['-map 0:v:0', '-map 1:a:0', '-c:v copy', '-c:a aac', `-t ${audioDurSec.toFixed(3)}`, '-y'])
    }

    cmd
      .output(outputPath)
      .on('end', () => {
        console.log(`[FFmpeg] ✓ Mux → ${path.basename(outputPath)} (vid:${videoDur.toFixed(2)}s aud:${audioDurSec.toFixed(2)}s pad:${pad.toFixed(2)}s)`)
        resolve()
      })
      .on('error', (err) => {
        console.error(`[FFmpeg] Mux error: ${err.message}`)
        reject(err)
      })
      .run()
  })
}

/** Get duration via ffmpeg -i (same approach as kling-pipeline — no ffprobe needed). */
function getAudioDurationSec(filePath) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegBin, ['-i', filePath], { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    proc.stderr.on('data', d => { out += d })
    proc.on('close', () => {
      const m = out.match(/Duration:\s*(\d+):(\d+):([\d.]+)/)
      if (!m) return reject(new Error('Cannot parse audio duration from ffmpeg output'))
      resolve(parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3]))
    })
  })
}

/** Generate SRT subtitle file content from per-scene narrations + durations. */
function generateSRT(narrations, durations) {
  const toSRT = (sec) => {
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    const s = Math.floor(sec % 60)
    const ms = Math.round((sec % 1) * 1000)
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(ms).padStart(3,'0')}`
  }
  let srt = '', idx = 1, elapsed = 0
  const WORDS_PER_LINE = 8
  for (let s = 0; s < narrations.length; s++) {
    const words = narrations[s].trim().split(/\s+/)
    const dur = durations[s]
    const chunks = []
    for (let w = 0; w < words.length; w += WORDS_PER_LINE) {
      chunks.push(words.slice(w, w + WORDS_PER_LINE).join(' '))
    }
    const chunkDur = dur / Math.max(chunks.length, 1)
    for (let c = 0; c < chunks.length; c++) {
      const start = elapsed + c * chunkDur
      const end = start + chunkDur - 0.04
      srt += `${idx}\n${toSRT(start)} --> ${toSRT(end)}\n${chunks[c]}\n\n`
      idx++
    }
    elapsed += dur
  }
  return srt
}

/** Burn SRT captions into a video file. */
function burnSubtitles(inputPath, srtPath, outputPath) {
  const escapedSrt = srtPath.replace(/\\/g, '/').replace(/^([A-Z]):/, '$1\\:')
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .videoFilter(`subtitles='${escapedSrt}':force_style='FontSize=18,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2,Bold=1,MarginV=30,Alignment=2,WrapStyle=2'`)
      .outputOptions(['-c:a copy', '-movflags +faststart', '-y'])
      .output(outputPath)
      .on('end', resolve)
      .on('error', reject)
      .run()
  })
}

/** Concatenate mp4 clips via concat demuxer. */
async function concatenateClips(clipPaths, outputPath) {
  console.log(`[FFmpeg] Concatenating ${clipPaths.length} clips → ${path.basename(outputPath)}`)
  const listPath = outputPath + '.txt'
  const listContent = clipPaths.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n')
  await fs.writeFile(listPath, listContent)
  await new Promise((resolve, reject) => {
    ffmpeg()
      .input(listPath)
      .inputOptions(['-f concat', '-safe 0'])
      .outputOptions(['-c copy', '-y'])
      .output(outputPath)
      .on('end', () => {
        console.log(`[FFmpeg] ✓ Concat done → ${path.basename(outputPath)}`)
        resolve()
      })
      .on('error', (err) => {
        console.error(`[FFmpeg] Concat error: ${err.message}`)
        reject(err)
      })
      .run()
  })
  await fs.unlink(listPath).catch(() => {})
}

// ── Main provider ──────────────────────────────────────────────────────────

export class SarvamTTSDubProvider {
  async dub({ contentItemId, language }) {
    const langConfig = LANG_CONFIG[language]
    if (!langConfig) throw new Error(`Unsupported dub language: ${language}`)

    const rendersDir = path.join(process.cwd(), 'public', 'renders')
    const sceneMetaPath = path.join(rendersDir, `${contentItemId}-scenes.json`)

    console.log(`\n[SarvamTTS] ════════════════════════════════════════`)
    console.log(`[SarvamTTS] Dubbing ${language} (${langConfig.code}) for ${contentItemId}`)
    console.log(`[SarvamTTS] ════════════════════════════════════════`)

    // Load scene data saved during render step
    let scenes
    try {
      scenes = JSON.parse(await fs.readFile(sceneMetaPath, 'utf8'))
      console.log(`[SarvamTTS] Loaded ${scenes.length} scenes from metadata`)
    } catch {
      throw new Error(`Scene metadata not found for ${contentItemId} — render must complete first`)
    }

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `dub-${contentItemId}-${language}-`))
    console.log(`[SarvamTTS] Temp dir: ${tmpDir}`)

    try {
      // Step 1: Translate narrations (skip for EN)
      console.log(`\n[SarvamTTS] STEP 1/3 — ${language === 'EN' ? 'Skipping translation (EN)' : `Translating ${scenes.length} scenes to ${language}`}…`)
      const narrations = await Promise.all(
        scenes.map(async (scene, i) => {
          if (language === 'EN') return scene.narration
          console.log(`[SarvamTTS] Translating scene ${i + 1}/${scenes.length}…`)
          return translateText(scene.narration, langConfig.code, scene.labels ?? [])
        })
      )
      console.log(`[SarvamTTS] Translation done for all ${narrations.length} scenes`)

      // Step 2: Generate TTS audio per scene (sequential — Sarvam rate limits)
      console.log(`\n[SarvamTTS] STEP 2/4 — Generating TTS audio (${langConfig.code})…`)
      const audioPaths = []
      const audioDurations = []
      for (let i = 0; i < narrations.length; i++) {
        const audioPath = await generateTTS(narrations[i], langConfig, i, tmpDir)
        const dur = await getAudioDurationSec(audioPath)
        audioPaths.push(audioPath)
        audioDurations.push(dur)
        console.log(`[SarvamTTS] Scene ${i + 1}: ${dur.toFixed(2)}s`)
      }
      console.log(`[SarvamTTS] All ${audioPaths.length} audio files ready`)

      // Step 3: Mux each scene clip + audio, then concatenate
      console.log(`\n[SarvamTTS] STEP 3/4 — Muxing and concatenating…`)
      const clipsDir = path.join(rendersDir, 'clips')
      const muxedPaths = []
      for (let i = 0; i < scenes.length; i++) {
        const clipPath = path.join(clipsDir, `${contentItemId}-scene-${i}.mp4`)
        const muxedPath = path.join(tmpDir, `muxed-${i}.mp4`)
        await muxClipWithAudio(clipPath, audioPaths[i], muxedPath, audioDurations[i])
        muxedPaths.push(muxedPath)
      }

      const rawOutputPath = path.join(tmpDir, `${contentItemId}-${language}-raw.mp4`)
      await concatenateClips(muxedPaths, rawOutputPath)

      // Step 4: Burn translated captions in target language
      console.log(`\n[SarvamTTS] STEP 4/4 — Burning ${language} captions…`)
      const srtPath = path.join(tmpDir, `captions-${language}.srt`)
      await fs.writeFile(srtPath, generateSRT(narrations, audioDurations), 'utf8')

      const outputFilename = `${contentItemId}-${language}.mp4`
      const outputPath = path.join(rendersDir, outputFilename)
      await burnSubtitles(rawOutputPath, srtPath, outputPath)

      const totalDuration = audioDurations.reduce((a, b) => a + b, 0)
      const fileUrl = `/renders/${outputFilename}`
      console.log(`\n[SarvamTTS] ✓ Dub complete for ${language}: ${fileUrl} (${totalDuration.toFixed(1)}s)`)
      console.log(`[SarvamTTS] ════════════════════════════════════════\n`)
      return { jobId: `${contentItemId}-${language}`, fileUrl, durationSec: totalDuration }
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
      console.log(`[SarvamTTS] Temp dir cleaned up`)
    }
  }
}
