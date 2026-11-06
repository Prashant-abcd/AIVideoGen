'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import {
  Form, Select, Radio, Checkbox, Button, Alert, Spin, Input,
} from 'antd'
import { RocketOutlined, GlobalOutlined } from '@ant-design/icons'
import { THEME, BRAND } from '@/lib/theme'

const LANGUAGES = [
  { value: 'HI', label: 'Hindi (HI)' },
  { value: 'TA', label: 'Tamil (TA)' },
  { value: 'BN', label: 'Bengali (BN)' },
  { value: 'MR', label: 'Marathi (MR)' },
]

const MASCOTS = [{ value: 'jigs', label: 'Jigs (Jigyaasu)' }]

export default function CreatePage() {
  const router = useRouter()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const selectedClass = Form.useWatch('classLevel', form)
  const selectedSubject = Form.useWatch('subject', form)
  const selectedChapterId = Form.useWatch('chapterId', form)

  const { data: chaptersData, isLoading: chaptersLoading } = useQuery({
    queryKey: ['chapters'],
    queryFn: () => fetch('/api/chapters').then((r) => r.json()),
  })

  const chapters = chaptersData?.chapters ?? []

  // Derived cascading options
  const classOptions = useMemo(() => {
    const classes = [...new Set(chapters.map((c) => c.classLevel))].sort()
    return classes.map((c) => ({ value: c, label: c }))
  }, [chapters])

  const subjectOptions = useMemo(() => {
    if (!selectedClass) return []
    const subjects = [...new Set(
      chapters.filter((c) => c.classLevel === selectedClass).map((c) => c.subject)
    )].sort()
    return subjects.map((s) => ({ value: s, label: s }))
  }, [chapters, selectedClass])

  const chapterOptions = useMemo(() => {
    if (!selectedClass || !selectedSubject) return []
    return chapters
      .filter((c) => c.classLevel === selectedClass && c.subject === selectedSubject)
      .map((c) => ({ value: c.id, label: c.chapterName }))
  }, [chapters, selectedClass, selectedSubject])

  const selectedChapter = useMemo(
    () => chapters.find((c) => c.id === selectedChapterId),
    [chapters, selectedChapterId]
  )

  const outcomeOptions = useMemo(() => {
    if (!selectedChapter) return []
    return selectedChapter.learningOutcomes.map((o) => ({ value: o, label: o }))
  }, [selectedChapter])

  function handleClassChange() {
    form.setFieldsValue({ subject: undefined, chapterId: undefined, learningOutcome: undefined })
  }
  function handleSubjectChange() {
    form.setFieldsValue({ chapterId: undefined, learningOutcome: undefined })
  }
  function handleChapterChange() {
    form.setFieldsValue({ learningOutcome: undefined })
  }

  async function handleSubmit(values) {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chapterId: values.chapterId,
          learningOutcome: values.learningOutcome,
          format: values.format,
          targetLanguages: values.targetLanguages ?? [],
          mascotId: values.mascotId ?? 'jigs',
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to create content')
        return
      }
      router.push(`/content/${data.item.id}`)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (chaptersLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: THEME.text, margin: 0 }}>
          Create Content
        </h1>
        <p style={{ fontSize: 13, color: THEME.textSecondary, margin: '4px 0 0' }}>
          Select a chapter and learning outcome to generate an AI script and start the review pipeline.
        </p>
      </div>

      <div style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 12, padding: 32 }}>
        {error && (
          <Alert message={error} type="error" showIcon style={{ marginBottom: 20, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)' }} />
        )}

        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{ format: 'SHORT', mascotId: 'jigs', targetLanguages: ['HI'] }}
        >
          {/* Class */}
          <Form.Item
            name="classLevel"
            label={<span style={{ fontWeight: 600, color: THEME.text }}>Class</span>}
            rules={[{ required: true, message: 'Select a class' }]}
          >
            <Select
              size="large"
              placeholder="Select class"
              options={classOptions}
              onChange={handleClassChange}
              style={{ maxWidth: 260 }}
            />
          </Form.Item>

          {/* Subject */}
          <Form.Item
            name="subject"
            label={<span style={{ fontWeight: 600, color: THEME.text }}>Subject</span>}
            rules={[{ required: true, message: 'Select a subject' }]}
          >
            <Select
              size="large"
              placeholder="Select subject"
              options={subjectOptions}
              disabled={!selectedClass}
              onChange={handleSubjectChange}
              style={{ maxWidth: 260 }}
            />
          </Form.Item>

          {/* Chapter */}
          <Form.Item
            name="chapterId"
            label={<span style={{ fontWeight: 600, color: THEME.text }}>Chapter</span>}
            rules={[{ required: true, message: 'Select a chapter' }]}
          >
            <Select
              size="large"
              placeholder="Select chapter"
              options={chapterOptions}
              disabled={!selectedSubject}
              onChange={handleChapterChange}
            />
          </Form.Item>

          {/* Learning Outcome */}
          <Form.Item
            name="learningOutcome"
            label={<span style={{ fontWeight: 600, color: THEME.text }}>Learning Outcome</span>}
            rules={[{ required: true, message: 'Select a learning outcome' }]}
          >
            <Select
              size="large"
              placeholder="Select the learning outcome for this video"
              options={outcomeOptions}
              disabled={!selectedChapterId}
              optionLabelProp="label"
            />
          </Form.Item>

          {/* Format */}
          <Form.Item
            name="format"
            label={<span style={{ fontWeight: 600, color: THEME.text }}>Format</span>}
            rules={[{ required: true }]}
          >
            <Radio.Group size="large">
              <Radio.Button value="SHORT">
                <div style={{ padding: '2px 4px' }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: THEME.text }}>Short (30–60s)</div>
                  <div style={{ fontSize: 11, color: THEME.textMuted }}>Reel / social format</div>
                </div>
              </Radio.Button>
              <Radio.Button value="EXPLAINER">
                <div style={{ padding: '2px 4px' }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: THEME.text }}>Explainer (3–5 min)</div>
                  <div style={{ fontSize: 11, color: THEME.textMuted }}>Full lesson format</div>
                </div>
              </Radio.Button>
            </Radio.Group>
          </Form.Item>

          {/* Languages */}
          <Form.Item
            name="targetLanguages"
            label={
              <span style={{ fontWeight: 600, color: THEME.text }}>
                <GlobalOutlined style={{ marginRight: 6 }} />
                Additional Languages (EN is always included)
              </span>
            }
            rules={[{ required: true, message: 'Select at least one language' }]}
          >
            <Checkbox.Group options={LANGUAGES} />
          </Form.Item>

          {/* Mascot */}
          <Form.Item
            name="mascotId"
            label={<span style={{ fontWeight: 600, color: THEME.text }}>Mascot</span>}
          >
            <Select size="large" options={MASCOTS} style={{ maxWidth: 260 }} />
          </Form.Item>


          <Button
            type="primary"
            htmlType="submit"
            loading={loading}
            size="large"
            icon={<RocketOutlined />}
            style={{
              background: THEME.primary, border: 'none',
              height: 46, fontWeight: 600, fontSize: 14,
              paddingInline: 32, borderRadius: 8,
            }}
          >
            {loading ? 'Generating Script…' : 'Generate Script'}
          </Button>
        </Form>
      </div>
    </div>
  )
}
