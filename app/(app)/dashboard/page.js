'use client'

import { useQuery, useMutation } from '@tanstack/react-query'
import { Tabs, Statistic, Tag, Spin, Button, Table, Tooltip } from 'antd'
import {
  ExclamationCircleOutlined,
  CheckCircleOutlined,
  SyncOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { THEME } from '@/lib/theme'

const STATE_ORDER = [
  'DRAFT', 'SCRIPT_GENERATING', 'SCRIPT_REVIEW', 'RENDERING',
  'PEDAGOGY_REVIEW', 'DUBBING', 'LANGUAGE_QC', 'FINAL_APPROVAL', 'PUBLISHED',
]

const STATE_COLORS = {
  DRAFT: '#6b7280',
  SCRIPT_GENERATING: '#8B5CF6',
  SCRIPT_REVIEW: THEME.warning,
  RENDERING: THEME.primary,
  PEDAGOGY_REVIEW: THEME.warning,
  DUBBING: THEME.success,
  LANGUAGE_QC: THEME.warning,
  FINAL_APPROVAL: THEME.error,
  PUBLISHED: THEME.success,
}

const LANG_FLAGS = { EN: '🇬🇧', HI: '🇮🇳', TA: '🇮🇳', BN: '🇧🇩', MR: '🇮🇳' }
const ALL_LANGS = ['EN', 'HI', 'TA', 'BN', 'MR']

function StatusDot({ status }) {
  const colors = { COMPLETED: THEME.success, PROCESSING: THEME.primary, PENDING: THEME.textMuted, FAILED: THEME.error }
  const labels = { COMPLETED: '✓', PROCESSING: '~', PENDING: '·', FAILED: '✗' }
  return (
    <Tooltip title={status}>
      <span style={{ color: colors[status] ?? THEME.textMuted, fontWeight: 700, fontSize: 14 }}>
        {labels[status] ?? '·'}
      </span>
    </Tooltip>
  )
}

function ProductionView() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'production'],
    queryFn: () => fetch('/api/dashboard/production').then((r) => r.json()),
    refetchInterval: 10000,
  })

  if (isLoading) return <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>

  const { countsByState = {}, totalItems = 0, overdueCount = 0, overdueTasks = [], languageMatrix = [] } = data ?? {}

  // Per-language known statuses in the matrix
  const matrixLangs = ALL_LANGS.filter((lang) =>
    languageMatrix.some((row) => row.langStatus[lang] !== undefined)
  )

  const matrixColumns = [
    {
      title: 'Item',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
      width: 280,
      render: (text, row) => (
        <a href={`/content/${row.id}`} style={{ color: THEME.primary, fontWeight: 600, fontSize: 13 }}>
          {text}
        </a>
      ),
    },
    {
      title: 'Stage',
      dataIndex: 'state',
      key: 'state',
      width: 140,
      render: (state) => (
        <span style={{ color: STATE_COLORS[state] ?? '#6b7280', fontSize: 12, fontWeight: 600 }}>
          {state?.replace(/_/g, ' ')}
        </span>
      ),
    },
    ...matrixLangs.map((lang) => ({
      title: (
        <span>{LANG_FLAGS[lang] ?? ''} {lang}</span>
      ),
      key: lang,
      width: 70,
      align: 'center',
      render: (_, row) => <StatusDot status={row.langStatus[lang] ?? 'PENDING'} />,
    })),
  ]

  return (
    <div>
      {/* Metric bar */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 28 }}>
        <div style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 12, padding: '16px 20px', flex: 1, minWidth: 140 }}>
          <Statistic title={<span style={{ color: THEME.textSecondary }}>Total Items</span>} value={totalItems} valueStyle={{ color: THEME.primary, fontWeight: 800 }} />
        </div>
        <div style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 12, padding: '16px 20px', flex: 1, minWidth: 140 }}>
          <Statistic title={<span style={{ color: THEME.textSecondary }}>Published</span>} value={countsByState.PUBLISHED ?? 0} valueStyle={{ color: THEME.success, fontWeight: 800 }} prefix={<CheckCircleOutlined />} />
        </div>
        <div style={{ background: overdueCount > 0 ? 'rgba(239, 68, 68, 0.1)' : THEME.surface, border: `1px solid ${overdueCount > 0 ? THEME.error : THEME.border}`, borderRadius: 12, padding: '16px 20px', flex: 1, minWidth: 140 }}>
          <Statistic title={<span style={{ color: THEME.textSecondary }}>Overdue</span>} value={overdueCount} valueStyle={{ color: overdueCount > 0 ? THEME.error : THEME.textSecondary, fontWeight: 800 }} prefix={overdueCount > 0 ? <ExclamationCircleOutlined /> : null} />
        </div>
        <div style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 12, padding: '16px 20px', flex: 1, minWidth: 140 }}>
          <Statistic title={<span style={{ color: THEME.textSecondary }}>In Review</span>} value={(countsByState.SCRIPT_REVIEW ?? 0) + (countsByState.PEDAGOGY_REVIEW ?? 0) + (countsByState.LANGUAGE_QC ?? 0) + (countsByState.FINAL_APPROVAL ?? 0)} valueStyle={{ color: THEME.warning, fontWeight: 800 }} prefix={<SyncOutlined />} />
        </div>
      </div>

      {/* State pipeline counts */}
      <div style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 12, padding: '20px 20px 12px', marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: THEME.text, marginBottom: 16 }}>Items by Pipeline Stage</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {STATE_ORDER.map((state) => {
            const count = countsByState[state] ?? 0
            const color = STATE_COLORS[state] ?? '#6b7280'
            return (
              <div key={state} style={{
                padding: '8px 14px', borderRadius: 8,
                background: color + '15', border: `1px solid ${color}35`,
                textAlign: 'center', minWidth: 90,
              }}>
                <div style={{ fontSize: 22, fontWeight: 800, color }}>{count}</div>
                <div style={{ fontSize: 10, color, fontWeight: 600, marginTop: 2 }}>
                  {state.replace(/_/g, ' ')}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Language completion matrix */}
      <div style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 12, padding: '20px', marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: THEME.text, marginBottom: 2 }}>Language Completion Matrix</div>
        <div style={{ fontSize: 12, color: THEME.textMuted, marginBottom: 14 }}>
          ✓ Completed · ~ Processing · · Pending · ✗ Failed
        </div>
        <Table
          dataSource={languageMatrix}
          columns={matrixColumns}
          rowKey="id"
          size="small"
          pagination={false}
          scroll={{ x: true }}
        />
      </div>

      {/* Overdue tasks */}
      {overdueTasks.length > 0 && (
        <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: `1px solid ${THEME.error}`, borderRadius: 12, padding: '16px 20px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: THEME.error, marginBottom: 10 }}>
            <ExclamationCircleOutlined style={{ marginRight: 6 }} />
            Overdue Items
          </div>
          {overdueTasks.map((task) => (
            <div key={task.id} style={{ fontSize: 12, color: THEME.textSecondary, padding: '4px 0', borderBottom: `1px solid rgba(239, 68, 68, 0.15)` }}>
              <a href={`/content/${task.contentItemId}`} style={{ color: THEME.error, fontWeight: 600 }}>
                {task.contentItem?.title}
              </a>
              <span style={{ color: THEME.textMuted, marginLeft: 8 }}>· waiting since {new Date(task.createdAt).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function PerformanceView() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['dashboard', 'performance'],
    queryFn: () => fetch('/api/dashboard/performance').then((r) => r.json()),
  })

  const { mutate: refreshAnalytics, isPending: refreshing } = useMutation({
    mutationFn: () => fetch('/api/dashboard/performance', { method: 'POST' }).then((r) => r.json()),
    onSuccess: () => refetch(),
  })

  if (isLoading) return <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>

  const {
    publishedCount = 0,
    totalViews = 0,
    totalLikes = 0,
    avgCompletion = 0,
    topVideos = [],
    viewsByLanguage = {},
  } = data ?? {}

  const topVideoColumns = [
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      render: (text, row) => (
        <a href={`/content/${row.id}`} style={{ color: THEME.primary, fontWeight: 600 }}>{text}</a>
      ),
    },
    {
      title: 'Views',
      dataIndex: 'views',
      key: 'views',
      sorter: (a, b) => b.views - a.views,
      render: (v) => v.toLocaleString(),
    },
  ]

  const maxViews = Math.max(...Object.values(viewsByLanguage), 1)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
        <Button
          icon={<ReloadOutlined spin={refreshing} />}
          loading={refreshing}
          onClick={() => refreshAnalytics()}
        >
          Refresh Analytics
        </Button>
      </div>

      {/* Metric cards */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 28 }}>
        {[
          { title: 'Videos Published', value: publishedCount, color: THEME.primary },
          { title: 'Total Views', value: totalViews.toLocaleString(), color: '#8B5CF6' },
          { title: 'Total Likes', value: totalLikes.toLocaleString(), color: THEME.warning },
          { title: 'Avg Completion', value: `${avgCompletion.toFixed(1)}%`, color: THEME.success },
        ].map((m) => (
          <div key={m.title} style={{
            background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 12,
            padding: '16px 20px', flex: 1, minWidth: 140,
          }}>
            <div style={{ fontSize: 12, color: THEME.textSecondary, marginBottom: 4 }}>{m.title}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: m.color }}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* Top videos + views by language */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: THEME.text, marginBottom: 14 }}>Top Videos by Views</div>
          {topVideos.length === 0 ? (
            <div style={{ color: THEME.textMuted, fontSize: 13 }}>No published videos yet</div>
          ) : (
            <Table
              dataSource={topVideos}
              columns={topVideoColumns}
              rowKey="id"
              size="small"
              pagination={false}
            />
          )}
        </div>

        <div style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: THEME.text, marginBottom: 14 }}>Views by Language</div>
          {Object.keys(viewsByLanguage).length === 0 ? (
            <div style={{ color: THEME.textMuted, fontSize: 13 }}>No analytics data yet</div>
          ) : (
            Object.entries(viewsByLanguage)
              .sort(([, a], [, b]) => b - a)
              .map(([lang, views]) => (
                <div key={lang} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: THEME.text }}>
                      {LANG_FLAGS[lang] ?? '🌐'} {lang}
                    </span>
                    <span style={{ fontSize: 12, color: THEME.textSecondary }}>{views.toLocaleString()}</span>
                  </div>
                  <div style={{ height: 6, background: THEME.surfaceHover, borderRadius: 3 }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${(views / maxViews) * 100}%`,
                        background: THEME.primary,
                        borderRadius: 3,
                        transition: 'width 0.4s',
                      }}
                    />
                  </div>
                </div>
              ))
          )}
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const tabItems = [
    {
      key: 'production',
      label: 'Production',
      children: <ProductionView />,
    },
    {
      key: 'performance',
      label: 'Performance',
      children: <PerformanceView />,
    },
  ]

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: THEME.text, margin: 0 }}>Dashboard</h1>
        <p style={{ fontSize: 13, color: THEME.textSecondary, margin: '4px 0 0' }}>
          Pipeline status and content performance analytics.
        </p>
      </div>
      <Tabs defaultActiveKey="production" size="large" items={tabItems} />
    </div>
  )
}
