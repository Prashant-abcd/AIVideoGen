import { MockLLMProvider } from './llm/mock.js'
import { MockRenderProvider } from './render/mock.js'
import { MockDubProvider } from './dub/mock.js'
import { MockAnalyticsProvider } from './analytics/mock.js'
import { GeminiLLMProvider } from './llm/gemini.js'
import { AnthropicLLMProvider } from './llm/anthropic.js'
import { KlingPipelineProvider } from './render/kling-pipeline.js'
import { SarvamTTSDubProvider } from './dub/sarvam-tts.js'

// Real providers are used when their API keys are present in the environment.
// Fallback to mocks when keys are missing (e.g. local dev without keys).
export const llmProvider = process.env.GEMINI_API_KEY
  ? new GeminiLLMProvider()
  : process.env.ANTHROPIC_API_KEY
    ? new AnthropicLLMProvider()
    : new MockLLMProvider()

// Runway pipeline (Runway b-roll + Sarvam TTS + ffmpeg composite).
export const renderProvider = process.env.RUNWAY_API_KEY
  ? new KlingPipelineProvider()
  : new MockRenderProvider()

export const dubProvider = process.env.SARVAM_API_KEY
  ? new SarvamTTSDubProvider()
  : new MockDubProvider()

export const analyticsProvider = new MockAnalyticsProvider()
