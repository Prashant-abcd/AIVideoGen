'use client'

import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Tag, Badge, Spin, Empty, Tooltip } from 'antd'
import {
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  GlobalOutlined,
} from '@ant-design/icons'
import { THEME } from '@/lib/theme'

const STATES = [
  { key: 'DRAFT', label: 'Draft', color: '#6b7280' },
  { key: 'SCRIPT_GENERATING', label: 'Generating Script', color: '#8B5CF6' },
  { key: 'SCRIPT_REVIEW', label: 'Script Review', color: THEME.warning },
  { key: 'RENDERING', label: 'Rendering', color: THEME.primary },
  { key: 'PEDAGOGY_REVIEW', label: 'Pedagogy Review', color: THEME.warning },
  { key: 'DUBBING', label: 'Dubbing', color: THEME.success },
  { key: 'LANGUAGE_QC', label: 'Language QC', color: THEME.warning },
  { key: 'FINAL_APPROVAL', label: 'Final Approval', color: THEME.error },
  { key: 'PUBLISHED', label: 'Published', color: THEME.success },
]

const LANG_LABELS = { EN: 'EN', HI: 'HI', TA: 'TA', BN: 'BN', MR: 'MR' }
const LANG_COLORS = {
  EN: THEME.primary, HI: THEME.warning, TA: THEME.success, BN: '#8B5CF6', MR: THEME.error,
}

function StateChip({ state }) {
  const s = STATES.find((x) => x.key === state) ?? { label: state, color: '#6b7280' }
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
        background: s.color + '22',
        color: s.color,
        letterSpacing: 0.3,
      }}
    >
      {s.label.toUpperCase()}
    </span>
  )
}

function ContentCard({ item, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: THEME.surface,
        border: item.overdue ? `1.5px solid ${THEME.error}` : `1px solid ${THEME.border}`,
        borderRadius: 8,
        padding: '12px 14px',
        cursor: 'pointer',
        transition: 'box-shadow 0.15s, transform 0.15s',
        marginBottom: 8,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(99, 102, 241, 0.2)'
        e.currentTarget.style.transform = 'translateY(-1px)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = 'none'
        e.currentTarget.style.transform = 'none'
      }}
    >
      {/* Overdue warning */}
      {item.overdue && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
          <ExclamationCircleOutlined style={{ color: THEME.error, fontSize: 11 }} />
          <span style={{ color: THEME.error, fontSize: 11, fontWeight: 600 }}>OVERDUE</span>
        </div>
      )}

      {/* Title */}
      <div style={{ fontSize: 13, fontWeight: 600, color: THEME.text, lineHeight: 1.4, marginBottom: 8 }}>
        {item.title}
      </div>

      {/* Meta row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: THEME.textSecondary }}>v{item.currentVersion}</span>
        <span style={{ color: THEME.textMuted, fontSize: 11 }}>·</span>
        <span style={{ fontSize: 11, color: THEME.textSecondary }}>{item.classLevel}</span>
        <span style={{ color: THEME.textMuted, fontSize: 11 }}>·</span>
        <span style={{ fontSize: 11, color: THEME.textSecondary }}>{item.subject}</span>
      </div>

      {/* Language chips */}
      {item.targetLanguages?.length > 0 && (
        <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: THEME.textSecondary, lineHeight: '20px' }}>
            <GlobalOutlined style={{ marginRight: 3 }} />
          </span>
          {['EN', ...item.targetLanguages].map((lang) => (
            <span
              key={lang}
              style={{
                padding: '1px 6px',
                borderRadius: 3,
                fontSize: 10,
                fontWeight: 700,
                background: (LANG_COLORS[lang] ?? '#6b7280') + '18',
                color: LANG_COLORS[lang] ?? '#6b7280',
                border: `1px solid ${(LANG_COLORS[lang] ?? '#6b7280')}30`,
              }}
            >
              {lang}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function Column({ state, items, onCardClick }) {
  const s = STATES.find((x) => x.key === state.key) ?? state
  return (
    <div
      style={{
        background: THEME.surface,
        border: `1px solid ${THEME.border}`,
        borderRadius: 10,
        padding: '12px 10px',
        minWidth: 220,
        flex: '0 0 220px',
      }}
    >
      {/* Column header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: THEME.text, letterSpacing: 0.3 }}>
            {s.label.toUpperCase()}
          </span>
        </div>
        <span
          style={{
            background: s.color + '20', color: s.color,
            borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 700,
          }}
        >
          {items.length}
        </span>
      </div>

      {/* Cards */}
      {items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '20px 0', color: THEME.textMuted, fontSize: 12 }}>
          Empty
        </div>
      ) : (
        items.map((item) => (
          <ContentCard key={item.id} item={item} onClick={() => onCardClick(item.id)} />
        ))
      )}
    </div>
  )
}

export default function BoardPage() {
  const router = useRouter()

  const { data, isLoading } = useQuery({
    queryKey: ['content'],
    queryFn: () => fetch('/api/content').then((r) => r.json()),
    refetchInterval: 8000,
    staleTime: 4000,
  })

  const items = data?.items ?? []

  // Group by state
  const grouped = {}
  STATES.forEach((s) => { grouped[s.key] = [] })
  items.forEach((item) => {
    if (grouped[item.state]) grouped[item.state].push(item)
  })

  const overdueCount = items.filter((i) => i.overdue).length
  const publishedCount = items.filter((i) => i.state === 'PUBLISHED').length

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div>
      {/* Page header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: THEME.text, margin: 0 }}>
            Pipeline Board
          </h1>
          <div style={{ display: 'flex', gap: 12 }}>
            <span style={{ fontSize: 13, color: THEME.textSecondary }}>
              {items.length} total
            </span>
            {overdueCount > 0 && (
              <span style={{ fontSize: 13, color: THEME.error, fontWeight: 600 }}>
                <ExclamationCircleOutlined style={{ marginRight: 4 }} />
                {overdueCount} overdue
              </span>
            )}
            <span style={{ fontSize: 13, color: THEME.success }}>
              {publishedCount} published
            </span>
          </div>
        </div>
        <p style={{ fontSize: 13, color: THEME.textSecondary, margin: '4px 0 0' }}>
          Live view — refreshes every 8 seconds. Click any card to open details.
        </p>
      </div>

      {/* Kanban */}
      <div
        style={{
          display: 'flex',
          gap: 10,
          overflowX: 'auto',
          paddingBottom: 16,
        }}
      >
        {STATES.map((s) => (
          <Column
            key={s.key}
            state={s}
            items={grouped[s.key] ?? []}
            onCardClick={(id) => router.push(`/content/${id}`)}
          />
        ))}
      </div>
    </div>
  )
}
