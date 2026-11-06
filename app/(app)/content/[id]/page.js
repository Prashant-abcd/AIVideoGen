'use client'

import { useState } from 'react'
import { use } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import {
  Tag, Spin, Button, Timeline, Tabs, Select, Divider, Alert, Input,
} from 'antd'
import {
  ArrowLeftOutlined,
  PlayCircleOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
  FileTextOutlined,
  ExclamationCircleOutlined,
  SendOutlined,
} from '@ant-design/icons'
import { THEME } from '@/lib/theme'

const STATE_COLORS = {
  DRAFT: { color: '#6b7280', bg: 'rgba(100, 116, 139, 0.12)' },
  SCRIPT_GENERATING: { color: '#8B5CF6', bg: 'rgba(139, 92, 246, 0.12)' },
  SCRIPT_REVIEW: { color: THEME.warning, bg: 'rgba(245, 158, 11, 0.12)' },
  RENDERING: { color: THEME.primary, bg: 'rgba(99, 102, 241, 0.12)' },
  PEDAGOGY_REVIEW: { color: THEME.warning, bg: 'rgba(245, 158, 11, 0.12)' },
  DUBBING: { color: THEME.success, bg: 'rgba(16, 185, 129, 0.12)' },
  LANGUAGE_QC: { color: THEME.warning, bg: 'rgba(245, 158, 11, 0.12)' },
  FINAL_APPROVAL: { color: THEME.error, bg: 'rgba(239, 68, 68, 0.12)' },
  PUBLISHED: { color: THEME.success, bg: 'rgba(16, 185, 129, 0.12)' },
  REJECTED: { color: THEME.error, bg: 'rgba(239, 68, 68, 0.12)' },
}

const LANG_FLAGS = { EN: '🇬🇧', HI: '🇮🇳', TA: '🇮🇳', BN: '🇧🇩', MR: '🇮🇳' }
const ASSET_STATUS_COLOR = {
  PENDING: 'default',
  PROCESSING: 'processing',
  COMPLETED: 'success',
  FAILED: 'error',
}

function StateTag({ state }) {
  const s = STATE_COLORS[state] ?? { color: '#6b7280', bg: 'rgba(100, 116, 139, 0.12)' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 12px', borderRadius: 20,
      background: s.bg, color: s.color, fontWeight: 700, fontSize: 12, letterSpacing: 0.3,
    }}>
      {state === 'SCRIPT_GENERATING' || state === 'RENDERING' || state === 'DUBBING'
        ? <SyncOutlined spin />
        : state === 'PUBLISHED' ? <CheckCircleOutlined />
        : state === 'REJECTED' ? <CloseCircleOutlined />
        : null}
      {state.replace(/_/g, ' ')}
    </span>
  )
}

function parseScriptScenes(scriptText) {
  // Split into per-scene blocks at each [SCENE N: boundary
  const blocks = scriptText.split(/(?=\[SCENE\s+\d+:)/i).filter(s => s.trim())
  return blocks.map(block => {
    const numMatch = block.match(/\[SCENE\s+(\d+):/i)
    if (!numMatch) return null

    // LABELS: line is the hard separator between visual and narration
    const labelLineMatch = block.match(/^LABELS:\s*(.+)$/m)
    if (!labelLineMatch) return null

    const labelPos = block.indexOf(labelLineMatch[0])
    const labels = labelLineMatch[1].split('|').map(s => s.trim()).filter(Boolean)

    // Visual = everything from after [SCENE N: up to the LABELS line
    // Remove outer brackets, [T=...] markers, and leading/trailing ] characters
    const afterHeader = block.slice(numMatch.index + numMatch[0].length, labelPos)
    const visual = afterHeader
      .replace(/\[\s*T=[^\]]+\]/gi, '')  // strip [T=0–3s] style markers
      .replace(/^\s*\]/, '')              // strip leading ] if scene closed before LABELS
      .replace(/\]\s*$/, '')             // strip trailing ]
      .trim()

    // Narration = everything after the LABELS line
    const narration = block.slice(labelPos + labelLineMatch[0].length).trim()

    return { num: numMatch[1], visual, labels, narration }
  }).filter(Boolean)
}

function ScriptVersionDiff({ versions }) {
  const [selectedV, setSelectedV] = useState(null)

  if (!versions?.length) return <div style={{ color: THEME.textMuted }}>No script yet</div>

  const latestV = versions[versions.length - 1]
  const current = versions.find((v) => v.versionNo === selectedV) ?? latestV
  const scenes = parseScriptScenes(current.scriptText || '')

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: THEME.text }}>Version:</span>
        <Select
          size="small"
          value={current.versionNo}
          onChange={setSelectedV}
          style={{ width: 120 }}
          options={[...versions].reverse().map((v) => ({
            value: v.versionNo,
            label: `v${v.versionNo}${v.versionNo === latestV.versionNo ? ' (latest)' : ''}`,
          }))}
        />
        <Tag color={current.generatedBy === 'LLM' ? 'purple' : 'orange'} style={{ fontSize: 10 }}>
          {current.generatedBy === 'LLM' ? 'AI Generated' : 'Human Edited'}
        </Tag>
        <span style={{ fontSize: 11, color: THEME.textMuted }}>
          {new Date(current.createdAt).toLocaleString()}
        </span>
      </div>

      {scenes.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {scenes.map((scene) => (
            <div key={scene.num} style={{ border: `1px solid ${THEME.border}`, borderRadius: 8, overflow: 'hidden' }}>
              {/* Scene header */}
              <div style={{ background: THEME.primary, padding: '8px 14px' }}>
                <span style={{ color: '#fff', fontWeight: 700, fontSize: 13, letterSpacing: 0.5 }}>
                  SCENE {scene.num}
                </span>
              </div>

              <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Narration — what TTS will speak */}
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: THEME.textSecondary, letterSpacing: 0.8, marginBottom: 4 }}>
                    NARRATION (spoken aloud)
                  </div>
                  <div style={{ fontSize: 14, lineHeight: 1.7, color: THEME.text, fontFamily: "'Georgia', serif" }}>
                    {scene.narration || <span style={{ color: THEME.textMuted }}>—</span>}
                  </div>
                </div>

                {/* Labels — text overlays */}
                {scene.labels.length > 0 && (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: THEME.textSecondary, letterSpacing: 0.8, marginBottom: 6 }}>
                      ON-SCREEN LABELS
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {scene.labels.map((lbl, i) => (
                        <Tag key={i} style={{ fontSize: 12, margin: 0, background: 'rgba(99, 102, 241, 0.12)', borderColor: 'rgba(99, 102, 241, 0.35)', color: THEME.primary }}>
                          {lbl}
                        </Tag>
                      ))}
                    </div>
                  </div>
                )}

                {/* Visual — AI animation description */}
                <details style={{ marginTop: 2 }}>
                  <summary style={{ fontSize: 11, color: THEME.textMuted, cursor: 'pointer', userSelect: 'none' }}>
                    Runway visual prompt (AI animation description)
                  </summary>
                  <div style={{
                    marginTop: 6, padding: '10px 12px', background: THEME.surfaceHover,
                    border: `1px solid ${THEME.border}`, borderRadius: 6,
                    fontSize: 12, color: THEME.textSecondary, lineHeight: 1.6, fontStyle: 'italic',
                  }}>
                    {scene.visual}
                  </div>
                </details>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{
          background: THEME.surfaceHover, border: `1px solid ${THEME.border}`, borderRadius: 6,
          padding: '14px 16px', fontSize: 13, lineHeight: 1.9,
          whiteSpace: 'pre-wrap', maxHeight: 400, overflowY: 'auto',
          fontFamily: "'Georgia', serif", color: THEME.text,
        }}>
          {current.scriptText}
        </div>
      )}
    </div>
  )
}

function RenderAssetCard({ asset, onRetry }) {
  const s = ASSET_STATUS_COLOR[asset.status] ?? 'default'
  return (
    <div style={{
      border: `1px solid ${THEME.border}`, borderRadius: 8, padding: '12px 14px',
      background: THEME.surface, marginBottom: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 16 }}>{LANG_FLAGS[asset.language] ?? '🌐'}</span>
        <span style={{ fontWeight: 700, fontSize: 13, color: THEME.text }}>{asset.language}</span>
        <Tag style={{ fontSize: 10, margin: 0, background: THEME.surfaceHover, borderColor: THEME.border, color: THEME.textSecondary }}>{asset.type}</Tag>
        <Tag color={s} style={{ fontSize: 10, margin: 0 }}>{asset.status}</Tag>
      </div>
      {asset.status === 'COMPLETED' && asset.fileUrl ? (
        <video
          key={asset.fileUrl}
          src={asset.fileUrl}
          controls
          style={{ width: '100%', borderRadius: 6, maxHeight: 220 }}
        />
      ) : asset.status === 'PROCESSING' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: THEME.textSecondary, fontSize: 13 }}>
          <SyncOutlined spin style={{ color: THEME.primary }} />
          Processing…
        </div>
      ) : asset.status === 'FAILED' ? (
        <div>
          <div style={{ color: THEME.error, fontSize: 13, marginBottom: 8 }}>
            <ExclamationCircleOutlined style={{ marginRight: 6 }} />
            Render failed
          </div>
          {onRetry && (
            <Button
              size="small"
              type="primary"
              danger
              icon={<SyncOutlined />}
              onClick={onRetry}
              style={{ fontWeight: 600 }}
            >
              Retry Render
            </Button>
          )}
        </div>
      ) : (
        <div style={{ color: THEME.textMuted, fontSize: 13 }}>Pending</div>
      )}
      {asset.durationSec && (
        <div style={{ fontSize: 11, color: THEME.textMuted, marginTop: 4 }}>
          <ClockCircleOutlined style={{ marginRight: 4 }} />
          {asset.durationSec}s
        </div>
      )}
    </div>
  )
}

function AuditTimeline({ events }) {
  if (!events?.length) return <div style={{ color: THEME.textMuted }}>No events yet</div>

  const iconFor = (action) => {
    if (action === 'approve' || action === 'llm_complete' || action === 'render_complete' || action === 'dubs_complete') return <CheckCircleOutlined style={{ color: THEME.success }} />
    if (action === 'reject') return <CloseCircleOutlined style={{ color: THEME.error }} />
    if (action === 'submit') return <PlayCircleOutlined style={{ color: THEME.primary }} />
    return <ClockCircleOutlined style={{ color: THEME.textMuted }} />
  }

  return (
    <Timeline
      items={events.map((e) => ({
        dot: iconFor(e.action),
        children: (
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: THEME.text }}>
              {e.action.replace(/_/g, ' ').toUpperCase()}
              {e.fromState && e.toState && (
                <span style={{ fontWeight: 400, color: THEME.textSecondary, marginLeft: 8 }}>
                  {e.fromState} → {e.toState}
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: THEME.textMuted }}>
              {e.actor?.name} · {new Date(e.timestamp).toLocaleString()}
            </div>
            {e.comment && (
              <div style={{ fontSize: 12, color: THEME.textSecondary, marginTop: 4, fontStyle: 'italic' }}>
                "{e.comment}"
              </div>
            )}
          </div>
        ),
      }))}
    />
  )
}

export default function ContentDetailPage({ params }) {
  const { id } = use(params)
  const router = useRouter()
  const queryClient = useQueryClient()
  const [youtubeLinks, setYoutubeLinks] = useState({})
  const [savingLinks, setSavingLinks] = useState(false)
  const [revisionText, setRevisionText] = useState(null)
  const [submittingRevision, setSubmittingRevision] = useState(false)
  const [revisionResult, setRevisionResult] = useState(null)
  const [retrying, setRetrying] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['content', id],
    queryFn: () => fetch(`/api/content/${id}`).then((r) => r.json()),
    refetchInterval: 8000,
    staleTime: 4000,
  })

  const item = data?.item

  // Detect if this DRAFT item was rejected by SME
  const smeRejection = item?.state === 'DRAFT'
    ? item.auditEvents?.find((e) => e.action === 'reject' && e.fromState === 'SCRIPT_REVIEW')
    : null

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
        <Spin size="large" />
      </div>
    )
  }

  if (!item) {
    return (
      <Alert type="error" message="Content item not found" />
    )
  }

  const allLanguages = ['EN', ...(item.targetLanguages ?? [])]

  async function sendForRegeneration() {
    const text = revisionText ?? smeRejection?.comment ?? ''
    if (!text.trim()) return
    setSubmittingRevision(true)
    setRevisionResult(null)
    try {
      const res = await fetch(`/api/content/${id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'submit', comment: text }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to send for regeneration')
      setRevisionResult({ type: 'success', message: 'Sent for script generation with SME suggestions!' })
      setRevisionText(null)
      queryClient.invalidateQueries({ queryKey: ['content', id] })
    } catch (err) {
      setRevisionResult({ type: 'error', message: err.message })
    } finally {
      setSubmittingRevision(false)
    }
  }

  async function saveYoutubeLinks() {
    setSavingLinks(true)
    try {
      await fetch(`/api/content/${id}/youtube`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ links: youtubeLinks }),
      })
    } finally {
      setSavingLinks(false)
    }
  }

  async function retryRender() {
    setRetrying(true)
    try {
      const res = await fetch(`/api/content/${id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'retry_render' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Retry failed')
      queryClient.invalidateQueries({ queryKey: ['content', id] })
    } catch (err) {
      console.error('Retry render failed:', err)
    } finally {
      setRetrying(false)
    }
  }

  async function retryDub() {
    setRetrying(true)
    try {
      const res = await fetch(`/api/content/${id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'retry_dub' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Retry dub failed')
      queryClient.invalidateQueries({ queryKey: ['content', id] })
    } catch (err) {
      console.error('Retry dub failed:', err)
    } finally {
      setRetrying(false)
    }
  }

  const tabItems = [
    {
      key: 'script',
      label: (
        <span><FileTextOutlined style={{ marginRight: 6 }} />Script</span>
      ),
      children: (
        <div style={{ padding: '16px 0' }}>
          <ScriptVersionDiff versions={item.scriptVersions} />
        </div>
      ),
    },
    {
      key: 'media',
      label: (
        <span><PlayCircleOutlined style={{ marginRight: 6 }} />Media Assets</span>
      ),
      children: (
        <div style={{ padding: '16px 0' }}>
          {item.renderAssets?.length === 0 ? (
            <div style={{ color: THEME.textMuted }}>No render assets yet. Assets appear after script approval.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
              {item.renderAssets?.map((a) => (
                <RenderAssetCard
                  key={a.id}
                  asset={a}
                  onRetry={a.status === 'FAILED'
                    ? (a.type === 'DUB' && (item.state === 'DUBBING' || item.state === 'LANGUAGE_QC') ? retryDub : retryRender)
                    : undefined}
                />
              ))}
            </div>
          )}

          {/* YouTube link attachment (for published items) */}
          {item.state === 'PUBLISHED' && (
            <div style={{ marginTop: 24, padding: 16, background: 'rgba(16, 185, 129, 0.08)', border: `1px solid rgba(16, 185, 129, 0.25)`, borderRadius: 8 }}>
              <div style={{ fontWeight: 700, marginBottom: 12, color: THEME.success }}>
                Attach YouTube Links
              </div>
              {allLanguages.map((lang) => (
                <div key={lang} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ width: 28, fontWeight: 700, fontSize: 12, color: THEME.text }}>{lang}</span>
                  <Input
                    size="small"
                    placeholder="https://youtube.com/watch?v=..."
                    value={youtubeLinks[lang] ?? ''}
                    onChange={(e) => setYoutubeLinks((prev) => ({ ...prev, [lang]: e.target.value }))}
                    style={{ flex: 1 }}
                  />
                </div>
              ))}
              <Button
                size="small"
                type="primary"
                loading={savingLinks}
                onClick={saveYoutubeLinks}
                style={{ marginTop: 8, background: THEME.success, border: 'none' }}
              >
                Save Links
              </Button>
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'audit',
      label: 'Audit Trail',
      children: (
        <div style={{ padding: '16px 0' }}>
          <AuditTimeline events={item.auditEvents} />
        </div>
      ),
    },
  ]

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Back */}
      <Button
        type="text"
        icon={<ArrowLeftOutlined />}
        onClick={() => router.push('/board')}
        style={{ marginBottom: 16, color: THEME.textMuted, padding: 0 }}
      >
        Pipeline Board
      </Button>

      {/* Header */}
      <div style={{
        background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 12,
        padding: '20px 24px', marginBottom: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 18, fontWeight: 800, color: THEME.text, margin: '0 0 8px' }}>
              {item.title}
            </h1>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, color: THEME.textSecondary }}>
              <span>{item.classLevel}</span>
              <span>·</span>
              <span>{item.subject}</span>
              <span>·</span>
              <span>v{item.currentVersion}</span>
              <span>·</span>
              <span>{item.format}</span>
              <span>·</span>
              <span>Created by {item.createdBy?.name}</span>
            </div>
          </div>
          <StateTag state={item.state} />
        </div>

        {/* Language status */}
        <Divider style={{ margin: '14px 0 12px', borderColor: THEME.border }} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {allLanguages.map((lang) => {
            const asset = item.renderAssets?.find(
              (a) => a.language === lang && (a.type === 'MASTER' || a.type === 'DUB')
            )
            return (
              <div key={lang} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 12 }}>{LANG_FLAGS[lang] ?? '🌐'}</span>
                <Tag
                  color={asset?.status ? ASSET_STATUS_COLOR[asset.status] : 'default'}
                  style={{ fontSize: 11, margin: 0 }}
                >
                  {lang} {asset?.status ? `· ${asset.status}` : '· pending'}
                </Tag>
              </div>
            )
          })}
        </div>

        {/* Overdue warning */}
        {item.overdue && (
          <Alert
            type="warning"
            message="This item is overdue — a task has been waiting more than 48 hours."
            showIcon
            style={{ marginTop: 12, background: 'rgba(245, 158, 11, 0.08)', border: `1px solid rgba(245, 158, 11, 0.25)` }}
          />
        )}
      </div>

      {/* Revision panel — when SME rejected the script back to Coordinator */}
      {smeRejection && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.06)', border: `1px solid rgba(239, 68, 68, 0.25)`, borderRadius: 12,
          padding: '20px 24px', marginBottom: 20,
        }}>
          {revisionResult && (
            <Alert
              type={revisionResult.type}
              message={revisionResult.message}
              showIcon closable
              onClose={() => setRevisionResult(null)}
              style={{ marginBottom: 16 }}
            />
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <CloseCircleOutlined style={{ color: THEME.error, fontSize: 16 }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: THEME.error }}>
              SME Requested Changes
            </span>
            <span style={{ fontSize: 11, color: THEME.textMuted, marginLeft: 'auto' }}>
              {smeRejection.actor?.name} · {new Date(smeRejection.timestamp).toLocaleString()}
            </span>
          </div>
          <div style={{ fontSize: 12, color: THEME.textSecondary, marginBottom: 12 }}>
            Review the SME's feedback below. Edit if needed, then send for script regeneration.
            The AI will regenerate the script incorporating these suggestions.
          </div>
          <Input.TextArea
            value={revisionText ?? smeRejection.comment ?? ''}
            onChange={(e) => setRevisionText(e.target.value)}
            rows={4}
            style={{ marginBottom: 12, fontSize: 13, background: THEME.surface, borderColor: THEME.border, color: THEME.text }}
            placeholder="SME's suggestions for script improvement…"
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            size="middle"
            loading={submittingRevision}
            onClick={sendForRegeneration}
            disabled={!(revisionText ?? smeRejection.comment ?? '').trim()}
            style={{ background: THEME.primary, border: 'none', fontWeight: 600 }}
          >
            Send Changes for Script Generation
          </Button>
        </div>
      )}

      {/* Tabs */}
      <div style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 12, padding: '4px 24px 24px' }}>
        <Tabs items={tabItems} defaultActiveKey="script" />
      </div>
    </div>
  )
}
