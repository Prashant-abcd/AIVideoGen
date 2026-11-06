'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  List, Button, Tag, Alert, Spin, Input, Modal, Badge, Empty, Divider,
} from 'antd'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  ClockCircleOutlined,
  EditOutlined,
} from '@ant-design/icons'
import { THEME } from '@/lib/theme'

const STATE_LABELS = {
  SCRIPT_REVIEW: 'Script Review',
  PEDAGOGY_REVIEW: 'Pedagogy Review',
  LANGUAGE_QC: 'Language QC',
  FINAL_APPROVAL: 'Final Approval',
}

const ROLE_ACTIONS = {
  SME: { approveAction: 'approve', rejectAction: 'reject' },
  PEDAGOGY: { approveAction: 'approve', rejectAction: 'reject' },
  APPROVER: { approveAction: 'approve', rejectAction: 'reject' },
}

const QUEUE_DEFS = {
  pending:  { label: 'Pending',              color: THEME.warning, emptyText: 'No items pending review',          canEditScript: false },
  returned: { label: 'Returned by Pedagogy', color: '#8B5CF6', emptyText: 'No items returned for revision',  canEditScript: true  },
  dubbing:  { label: 'Dubbing QC',           color: THEME.primary, emptyText: 'No dubs pending QC',              canEditScript: false },
}

const ROLE_QUEUES = {
  SME:      ['pending', 'returned', 'dubbing'],
  PEDAGOGY: ['pending'],
  APPROVER: ['pending'],
}

function parseScriptScenes(scriptText) {
  const blocks = scriptText.split(/(?=\[SCENE\s+\d+:)/i).filter(s => s.trim())
  return blocks.map(block => {
    const numMatch = block.match(/\[SCENE\s+(\d+):/i)
    if (!numMatch) return null

    const labelLineMatch = block.match(/^LABELS:\s*(.+)$/m)
    if (!labelLineMatch) {
      // Fallback if no LABELS line: try to split at first closing bracket if possible
      const closeIdx = block.indexOf(']')
      if (closeIdx !== -1) {
        return {
          num: numMatch[1],
          visual: block.slice(numMatch.index + numMatch[0].length, closeIdx).trim(),
          narration: block.slice(closeIdx + 1).trim()
        }
      }
      return { num: numMatch[1], visual: '', narration: block.replace(/\[SCENE\s+\d+:/i, '').trim() }
    }

    const labelPos = block.indexOf(labelLineMatch[0])
    const afterHeader = block.slice(numMatch.index + numMatch[0].length, labelPos)
    const visual = afterHeader
      .replace(/\[\s*T=[^\]]+\]/gi, '')
      .replace(/^\s*\]/, '')
      .replace(/\]\s*$/, '')
      .trim()

    const narration = block.slice(labelPos + labelLineMatch[0].length).trim()
    return { num: numMatch[1], visual, labels: labelLineMatch[1].split('|'), narration }
  }).filter(Boolean)
}

function SceneScriptView({ script }) {
  if (!script) return <span style={{ color: THEME.textMuted, fontSize: 12 }}>No script yet</span>

  const scenes = parseScriptScenes(script)

  if (scenes.length === 0) {
    return (
      <div style={{ flex: 1, background: THEME.surfaceHover, border: `1px solid ${THEME.border}`, borderRadius: 6, padding: '12px 14px', fontSize: 12, lineHeight: 1.8, overflowY: 'auto', whiteSpace: 'pre-wrap', maxHeight: 400, color: THEME.text }}>
        {script}
      </div>
    )
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', maxHeight: 400, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {scenes.map((scene) => (
        <div key={scene.num} style={{ border: `1px solid ${THEME.border}`, borderRadius: 8, overflow: 'hidden' }}>
          {/* Scene header */}
          <div style={{ background: THEME.primary, color: '#fff', padding: '4px 10px', fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>
            SCENE {scene.num}
          </div>
          {/* Narration */}
          <div style={{ background: THEME.surface, padding: '12px 14px', fontSize: 14, lineHeight: 1.9, color: THEME.text }}>
            {scene.narration}
          </div>
        </div>
      ))}
    </div>
  )
}

function TaskListItem({ task, selected, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '12px 14px',
        cursor: 'pointer',
        borderBottom: `1px solid ${THEME.border}`,
        background: selected ? 'rgba(99, 102, 241, 0.12)' : THEME.surface,
        borderLeft: selected ? `3px solid ${THEME.primary}` : '3px solid transparent',
        transition: 'background 0.1s',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: THEME.text, marginBottom: 4, lineHeight: 1.3 }}>
            {task.contentItem.title}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Tag
              style={{ fontSize: 10, padding: '0 5px', margin: 0, borderRadius: 3, background: task.stage.includes('FINAL') ? 'rgba(239, 68, 68, 0.12)' : 'rgba(245, 158, 11, 0.12)', borderColor: 'transparent', color: task.stage.includes('FINAL') ? THEME.error : THEME.warning }}
            >
              {STATE_LABELS[task.stage] ?? task.stage.replace(/_/g, ' ')}
            </Tag>
            <span style={{ fontSize: 11, color: THEME.textMuted }}>
              {task.contentItem.classLevel} · {task.contentItem.subject} {task.contentItem.chapter?.chapterName ? `· ${task.contentItem.chapter.chapterName}` : ''} · Script v{task.contentItem.currentVersion}
            </span>
          </div>
        </div>
        {task.overdue && (
          <ExclamationCircleOutlined style={{ color: THEME.error, fontSize: 14, marginLeft: 8 }} />
        )}
      </div>
    </div>
  )
}

function ScriptReviewPanel({ task, item, user, canEditScript = false }) {
  const queryClient = useQueryClient()
  const [editedScript, setEditedScript] = useState(null)
  const [isEditing, setIsEditing] = useState(false)
  const [rejectModal, setRejectModal] = useState(false)
  const [rejectComment, setRejectComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)

  const { approveAction, rejectAction } = ROLE_ACTIONS[user.role] ?? ROLE_ACTIONS.SME

  const latestScript = item.scriptVersions?.[item.scriptVersions.length - 1]
  const displayScript = editedScript ?? latestScript?.scriptText ?? ''

  // Pedagogy rejection comment — shown when this task came back from Pedagogy
  const pedagogyComment = (task.stage === 'SCRIPT_REVIEW')
    ? item.auditEvents?.find((e) => e.action === 'reject' && e.fromState === 'PEDAGOGY_REVIEW')
    : null

  async function handleApprove() {
    setSubmitting(true)
    setResult(null)
    try {
      if (editedScript) {
        const saveRes = await fetch(`/api/content/${item.id}/script`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scriptText: editedScript }),
        })
        if (!saveRes.ok) throw new Error('Failed to save edited script')
      }
      const res = await fetch(`/api/content/${item.id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: approveAction, taskId: task.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Transition failed')

      setResult({ type: 'success', message: 'Approved — pipeline advanced!' })
      setEditedScript(null)
      setIsEditing(false)
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['content'] })
    } catch (err) {
      setResult({ type: 'error', message: err.message })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleReject() {
    if (!rejectComment.trim()) return
    setSubmitting(true)
    setResult(null)
    try {
      const res = await fetch(`/api/content/${item.id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: rejectAction, comment: rejectComment, taskId: task.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Transition failed')

      setRejectModal(false)
      setRejectComment('')
      setResult({ type: 'success', message: 'Returned for revision.' })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['content'] })
    } catch (err) {
      setResult({ type: 'error', message: err.message })
    } finally {
      setSubmitting(false)
    }
  }

  const isScriptStage = task.stage === 'SCRIPT_REVIEW' || task.stage.startsWith('LANGUAGE_QC')
  const isPedagogyStage = task.stage === 'PEDAGOGY_REVIEW'
  const isFinalStage = task.stage === 'FINAL_APPROVAL'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Result banner */}
      {result && (
        <Alert
          type={result.type}
          title={result.message}
          showIcon
          closable
          onClose={() => setResult(null)}
          style={{ marginBottom: 16 }}
        />
      )}

      {/* Pedagogy rejection comment */}
      {pedagogyComment && (
        <Alert
          type="warning"
          showIcon
          message={<span style={{ fontWeight: 700, color: THEME.text }}>Pedagogy requested changes</span>}
          description={
            <div>
              <div style={{ fontStyle: 'italic', marginBottom: 4, color: THEME.textSecondary }}>"{pedagogyComment.comment}"</div>
              <div style={{ fontSize: 11, color: THEME.textMuted }}>
                {pedagogyComment.actor?.name} · {new Date(pedagogyComment.timestamp).toLocaleString()}
              </div>
            </div>
          }
          style={{ marginBottom: 16, background: 'rgba(245, 158, 11, 0.08)', border: `1px solid rgba(245, 158, 11, 0.25)` }}
        />
      )}

      {/* Stage badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <Tag color={isFinalStage ? 'red' : 'orange'} style={{ fontSize: 12, padding: '2px 8px' }}>
          {STATE_LABELS[task.stage] ?? task.stage}
        </Tag>
        {task.overdue && (
          <Tag color="error" icon={<ClockCircleOutlined />}>Overdue</Tag>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, gap: 16 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: THEME.text, marginBottom: 4 }}>
            {item.title}
          </h2>
          <div style={{ fontSize: 12, color: THEME.textMuted }}>
            {item.classLevel} · {item.subject} · Script v{item.currentVersion}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {canEditScript ? (
            <>
              {!isEditing ? (
                <Button
                  icon={<EditOutlined />}
                  size="middle"
                  onClick={() => { setIsEditing(true); setEditedScript(displayScript) }}
                  style={{ fontWeight: 600 }}
                >
                  Edit
                </Button>
              ) : (
                <Button
                  size="middle"
                  onClick={() => { setIsEditing(false); setEditedScript(null) }}
                  style={{ fontWeight: 600 }}
                >
                  Cancel
                </Button>
              )}
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                size="middle"
                loading={submitting}
                onClick={handleApprove}
                style={{ background: THEME.success, border: 'none', fontWeight: 600 }}
              >
                {isEditing ? 'Save & Approve' : 'Approve'}
              </Button>
            </>
          ) : (
            <>
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                size="middle"
                loading={submitting}
                onClick={handleApprove}
                style={{ background: THEME.success, border: 'none', fontWeight: 600 }}
              >
                Approve
              </Button>
              <Button
                danger
                icon={<CloseCircleOutlined />}
                size="middle"
                disabled={submitting}
                onClick={() => setRejectModal(true)}
                style={{ fontWeight: 600 }}
              >
                Request Changes
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Script review layout */}
      {(isScriptStage || isFinalStage) && (
        <>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 16,
            flex: 1,
            minHeight: 0,
            marginBottom: 16,
          }}>
            {/* Generated script */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: THEME.text, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Script {editedScript ? '(edited)' : `(v${latestScript?.versionNo ?? 1})`}
                </span>

              </div>
              {isEditing ? (
                <Input.TextArea
                  value={editedScript}
                  onChange={(e) => setEditedScript(e.target.value)}
                  style={{ flex: 1, fontFamily: 'monospace', fontSize: 12, resize: 'none', minHeight: 320, background: THEME.surface, borderColor: THEME.border, color: THEME.text }}
                />
              ) : (
                <SceneScriptView script={displayScript} />
              )}
            </div>

            {/* Source — curriculum alignment proof */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: THEME.text, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Source Chapter
                </span>
                <div style={{ fontSize: 11, color: THEME.primary, marginTop: 2 }}>
                  Curriculum alignment reference
                </div>
              </div>
              <div style={{
                flex: 1,
                background: THEME.surfaceHover, border: `1px solid ${THEME.border}`, borderRadius: 6,
                padding: '12px 14px', fontSize: 11, lineHeight: 1.8, overflowY: 'auto',
                maxHeight: 400, color: THEME.text,
              }}>
                <div style={{ fontWeight: 700, color: THEME.text, marginBottom: 8, fontSize: 12 }}>
                  Learning Outcome:
                </div>
                <div style={{ color: THEME.textSecondary, marginBottom: 12, fontStyle: 'italic' }}>
                  {item.learningOutcome}
                </div>
                <Divider style={{ borderColor: THEME.border, margin: '8px 0' }} />
                <div style={{ whiteSpace: 'pre-wrap', color: THEME.textSecondary }}>
                  {item.chapter?.chapterText ?? 'Chapter text not available'}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Pedagogy: show video */}
      {isPedagogyStage && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: THEME.text, marginBottom: 8 }}>
            Rendered Video (English Master)
          </div>
          {item.renderAssets?.filter((a) => a.type === 'MASTER' && a.status === 'COMPLETED')
            .sort((a, b) => b.versionNo - a.versionNo)
            .map((asset, index, arr) => {
              const isLatest = index === 0;
              const isOriginal = index === arr.length - 1;
              return (
                <div key={asset.id} style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: THEME.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {isOriginal && !isLatest ? `Original (Script v${asset.versionNo})` : `Updated: ${arr.length - 1 - index} (Script v${asset.versionNo})`}
                      {isLatest && <span style={{ marginLeft: 8, color: THEME.success, background: 'rgba(16, 185, 129, 0.12)', padding: '2px 6px', borderRadius: 4 }}>Latest</span>}
                    </span>
                  </div>
                  <video
                src={asset.fileUrl}
                controls
                preload="metadata"
                style={{ width: '100%', maxWidth: 560, borderRadius: 8, border: `1px solid ${THEME.border}`, display: 'block' }}
              />
              <div style={{ fontSize: 11, color: THEME.textMuted, marginTop: 4 }}>
                Click play to preview · {asset.durationSec ? `${asset.durationSec}s` : ''}
              </div>
            </div>
            );
          })}
          {!item.renderAssets?.some((a) => a.type === 'MASTER' && a.status === 'COMPLETED') && (
            <div style={{ color: THEME.textMuted, fontSize: 13 }}>Render not yet available</div>
          )}
        </div>
      )}

      {/* Reject modal */}
      <Modal
        title="Request Changes"
        open={rejectModal}
        onOk={handleReject}
        onCancel={() => setRejectModal(false)}
        okText="Submit"
        okButtonProps={{ danger: true, loading: submitting, disabled: !rejectComment.trim() }}
        cancelButtonProps={{ disabled: submitting }}
      >
        <p style={{ color: THEME.textSecondary, marginBottom: 12 }}>
          Provide feedback for the team. This is required before returning the item.
        </p>
        <Input.TextArea
          rows={4}
          placeholder="What needs to be changed?"
          value={rejectComment}
          onChange={(e) => setRejectComment(e.target.value)}
          style={{ background: THEME.surface, borderColor: THEME.border, color: THEME.text }}
        />
      </Modal>
    </div>
  )
}

function DubReviewPanel({ task, item, user }) {
  const queryClient = useQueryClient()
  const [rejectModal, setRejectModal] = useState({ open: false, lang: null, taskId: null })
  const [rejectComment, setRejectComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)

  const isFinalApproval = task.stage === 'FINAL_APPROVAL'
  const masterAsset = item.renderAssets?.find(a => a.type === 'MASTER' && a.status === 'COMPLETED' && a.versionNo === item.currentVersion)

  async function handleAction(action, lang, specificTaskId) {
    setSubmitting(true)
    setResult(null)
    try {
      const res = await fetch(`/api/content/${item.id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, taskId: specificTaskId, comment: action === 'reject' ? rejectComment : undefined }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setResult({ type: 'success', message: action === 'approve' ? (isFinalApproval ? 'Published successfully.' : `${lang} Dub approved.`) : 'Returned for revision.' })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['content'] })
      if (action === 'reject') {
        setRejectModal({ open: false, lang: null, taskId: null })
        setRejectComment('')
      }
    } catch (err) {
      setResult({ type: 'error', message: err.message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ padding: '24px 32px', flex: 1, overflowY: 'auto' }}>
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: THEME.text, margin: '0 0 6px 0', lineHeight: 1.3 }}>
            {item.title}
          </h2>
          <div style={{ fontSize: 12, color: THEME.textMuted }}>
            {item.classLevel} · {item.subject} {item.chapter?.chapterName ? `· ${item.chapter.chapterName}` : ''} · Script v{item.currentVersion}
          </div>
        </div>

        {isFinalApproval && (
          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              danger
              onClick={() => setRejectModal({ open: true, lang: 'ALL', taskId: task.id })}
              disabled={submitting}
              style={{ fontWeight: 600 }}
            >
              Request Changes
            </Button>
            <Button
              type="primary"
              style={{ background: THEME.success, fontWeight: 600 }}
              onClick={() => handleAction('approve', 'All', task.id)}
              loading={submitting}
            >
              Publish All Videos
            </Button>
          </div>
        )}
      </div>

      {result && (
        <Alert
          type={result.type}
          message={result.message}
          showIcon
          style={{ marginBottom: 24 }}
        />
      )}

      {item.targetLanguages?.map((lang) => {
        const dubAsset = item.renderAssets?.find(a => a.type === 'DUB' && a.language === lang && a.status === 'COMPLETED' && a.versionNo === item.currentVersion)
        
        let langTask = null
        let isDone = false
        if (!isFinalApproval) {
          langTask = item.tasks?.find(t => t.stage === `LANGUAGE_QC_${lang}` && t.status === 'OPEN')
          isDone = !langTask
        }

        return (
          <div key={lang} style={{ marginBottom: 40, paddingBottom: 40, borderBottom: `1px solid ${THEME.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: THEME.primary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {lang} Version
              </div>
              
              <div style={{ display: 'flex', gap: 8 }}>
                {!isFinalApproval && (
                  <>
                    {!isDone ? (
                      <>
                        <Button danger onClick={() => setRejectModal({ open: true, lang, taskId: langTask.id })}>
                          Reject Dub
                        </Button>
                        <Button type="primary" style={{ background: THEME.primary }} onClick={() => handleAction('approve', lang, langTask.id)} loading={submitting}>
                          Approve {lang} Dub
                        </Button>
                      </>
                    ) : (
                      <Tag color="green" style={{ margin: 0, padding: '4px 12px', fontSize: 13, background: 'rgba(16, 185, 129, 0.12)', borderColor: 'transparent', color: THEME.success }}>
                        <CheckCircleOutlined /> Approved
                      </Tag>
                    )}
                  </>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: THEME.text, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                  Master Video (English)
                </div>
                {masterAsset ? (
                  <video
                    src={masterAsset.fileUrl}
                    controls
                    preload="metadata"
                    style={{ width: '100%', borderRadius: 8, border: `1px solid ${THEME.border}`, display: 'block' }}
                  />
                ) : (
                  <div style={{ color: THEME.textMuted, fontSize: 13, padding: 24, border: `1px dashed ${THEME.border}`, borderRadius: 8, textAlign: 'center' }}>
                    Master video not available
                  </div>
                )}
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: THEME.primary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                  Localized Dub ({lang})
                </div>
                {dubAsset ? (
                  <video
                    src={dubAsset.fileUrl}
                    controls
                    preload="metadata"
                    style={{ width: '100%', borderRadius: 8, border: `2px solid ${THEME.primary}`, display: 'block' }}
                  />
                ) : (
                  <div style={{ color: THEME.textMuted, fontSize: 13, padding: 24, border: `1px dashed ${THEME.border}`, borderRadius: 8, textAlign: 'center' }}>
                    Dub video generating or not available
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })}

      {/* Reject modal */}
      <Modal
        title={rejectModal.lang === 'ALL' ? 'Request Changes (Final Approval)' : `Reject ${rejectModal.lang} Dub`}
        open={rejectModal.open}
        onOk={() => handleAction('reject', rejectModal.lang, rejectModal.taskId)}
        onCancel={() => setRejectModal({ open: false, lang: null, taskId: null })}
        okText="Submit"
        okButtonProps={{ danger: true, loading: submitting, disabled: !rejectComment.trim() }}
        cancelButtonProps={{ disabled: submitting }}
      >
        <p style={{ color: THEME.textSecondary, marginBottom: 12 }}>
          Provide feedback for the team. This is required before returning the item.
        </p>
        <Input.TextArea
          rows={4}
          placeholder="What needs to be changed in the dub?"
          value={rejectComment}
          onChange={(e) => setRejectComment(e.target.value)}
          style={{ background: THEME.surface, borderColor: THEME.border, color: THEME.text }}
        />
      </Modal>
    </div>
  )
}

export default function ReviewPage() {
  const [selectedTaskId, setSelectedTaskId] = useState(null)
  const [activeQueue, setActiveQueue] = useState('pending')

  const { data: tasksData, isLoading: tasksLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => fetch('/api/tasks').then((r) => r.json()),
    refetchInterval: 10000,
    staleTime: 5000,
  })

  const { data: meData } = useQuery({
    queryKey: ['me'],
    queryFn: () => fetch('/api/auth/me').then((r) => r.json()),
    staleTime: 0,
  })

  const user = meData?.user
  const role = user?.role ?? 'SME'
  const queues = ROLE_QUEUES[role] ?? ['pending']

  const queueData = {}
  queues.forEach((q) => { queueData[q] = tasksData?.[q] ?? [] })

  const safeQueue = queues.includes(activeQueue) ? activeQueue : queues[0]
  const activeList = queueData[safeQueue] ?? []
  const selectedTask = activeList.find((t) => t.id === selectedTaskId) ?? activeList[0] ?? null
  const canEditScript = QUEUE_DEFS[safeQueue]?.canEditScript ?? false

  const { data: itemData, isLoading: itemLoading } = useQuery({
    queryKey: ['content', selectedTask?.contentItem?.id],
    queryFn: () => fetch(`/api/content/${selectedTask.contentItem.id}`).then((r) => r.json()),
    enabled: !!selectedTask?.contentItem?.id,
    staleTime: 10000,
  })

  const item = itemData?.item

  if (tasksLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', gap: 0, height: 'calc(100vh - 120px)', background: THEME.surface, borderRadius: 12, border: `1px solid ${THEME.border}`, overflow: 'hidden' }}>
      {/* Left panel — queue tabs + task list */}
      <div style={{ width: 280, flexShrink: 0, borderRight: `1px solid ${THEME.border}`, display: 'flex', flexDirection: 'column' }}>
        <div style={{ borderBottom: `1px solid ${THEME.border}` }}>
          {queues.map((q) => {
            const cfg = QUEUE_DEFS[q]
            const count = queueData[q]?.length ?? 0
            const active = safeQueue === q
            return (
              <div
                key={q}
                onClick={() => { setActiveQueue(q); setSelectedTaskId(null) }}
                style={{
                  padding: '10px 16px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: active ? cfg.color + '12' : 'transparent',
                  borderLeft: active ? `3px solid ${cfg.color}` : '3px solid transparent',
                  transition: 'background 0.1s',
                }}
              >
                <span style={{ fontSize: 12, fontWeight: active ? 700 : 500, color: active ? cfg.color : THEME.textSecondary }}>
                  {cfg.label}
                </span>
                {count > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10, background: cfg.color + '20', color: cfg.color }}>
                    {count}
                  </span>
                )}
              </div>
            )
          })}
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {activeList.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center' }}>
              <CheckCircleOutlined style={{ fontSize: 28, color: THEME.success, marginBottom: 8 }} />
              <div style={{ fontSize: 12, color: THEME.textMuted }}>{QUEUE_DEFS[safeQueue]?.emptyText}</div>
            </div>
          ) : (
            activeList.map((task) => (
              <TaskListItem
                key={task.id}
                task={task}
                selected={task.id === selectedTask?.id}
                onClick={() => setSelectedTaskId(task.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* Right panel — review content */}
      <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
        {!selectedTask ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <Empty description="Select a task from the queue" />
          </div>
        ) : itemLoading || !item ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
            <Spin size="large" />
          </div>
        ) : (
          (selectedTask.stage.startsWith('LANGUAGE_QC') || selectedTask.stage === 'FINAL_APPROVAL') ? (
            <DubReviewPanel task={selectedTask} item={item} user={user} />
          ) : (
            <ScriptReviewPanel
              task={selectedTask}
              item={item}
              user={user}
              canEditScript={canEditScript}
            />
          )
        )}
      </div>
    </div>
  )
}
