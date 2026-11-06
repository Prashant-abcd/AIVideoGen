'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Table, Input, Select, Tag, Spin } from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import { THEME } from '@/lib/theme'

const ACTION_COLORS = {
  submit: THEME.primary,
  approve: THEME.success,
  reject: THEME.error,
  llm_complete: '#8B5CF6',
  render_complete: THEME.primary,
  dubs_complete: THEME.accent,
  all_approved: THEME.success,
  script_edited: THEME.warning,
}

const ROLE_COLORS = {
  COORDINATOR: THEME.primary,
  SME: THEME.warning,
  PEDAGOGY: '#8B5CF6',
  APPROVER: THEME.error,
}

export default function AuditPage() {
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['audit', actionFilter],
    queryFn: () => {
      const params = new URLSearchParams()
      if (actionFilter) params.set('action', actionFilter)
      return fetch(`/api/audit?${params}`).then((r) => r.json())
    },
    refetchInterval: 15000,
  })

  const events = (data?.events ?? []).filter((e) => {
    if (!search) return true
    const s = search.toLowerCase()
    return (
      e.contentItem?.title?.toLowerCase().includes(s) ||
      e.actor?.name?.toLowerCase().includes(s) ||
      e.action?.toLowerCase().includes(s) ||
      e.comment?.toLowerCase().includes(s)
    )
  })

  const columns = [
    {
      title: 'Time',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 150,
      render: (v) => (
        <span style={{ fontSize: 12, color: THEME.textSecondary }}>
          {new Date(v).toLocaleString()}
        </span>
      ),
    },
    {
      title: 'Action',
      dataIndex: 'action',
      key: 'action',
      width: 150,
      render: (action) => (
        <Tag color={ACTION_COLORS[action] ?? 'default'} style={{ fontSize: 11, border: 'none', background: (ACTION_COLORS[action] ?? '#6b7280') + '22', color: ACTION_COLORS[action] ?? '#6b7280' }}>
          {action.replace(/_/g, ' ').toUpperCase()}
        </Tag>
      ),
    },
    {
      title: 'Content Item',
      key: 'item',
      render: (_, row) => (
        <a
          href={`/content/${row.contentItemId}`}
          style={{ color: THEME.primary, fontWeight: 600, fontSize: 13 }}
        >
          {row.contentItem?.title ?? row.contentItemId}
        </a>
      ),
    },
    {
      title: 'State Change',
      key: 'states',
      width: 260,
      render: (_, row) => {
        if (!row.fromState && !row.toState) return <span style={{ color: THEME.textMuted }}>—</span>
        return (
          <span style={{ fontSize: 12 }}>
            <span style={{ color: THEME.textSecondary }}>{row.fromState?.replace(/_/g, ' ')}</span>
            {row.fromState && row.toState && (
              <span style={{ color: THEME.textMuted, margin: '0 6px' }}>→</span>
            )}
            <span style={{ color: THEME.text, fontWeight: 600 }}>{row.toState?.replace(/_/g, ' ')}</span>
          </span>
        )
      },
    },
    {
      title: 'Actor',
      key: 'actor',
      width: 160,
      render: (_, row) => (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: THEME.text }}>{row.actor?.name}</div>
          <span style={{
            fontSize: 10, padding: '1px 5px', borderRadius: 3,
            background: (ROLE_COLORS[row.actor?.role] ?? '#6b7280') + '18',
            color: ROLE_COLORS[row.actor?.role] ?? '#6b7280',
            fontWeight: 600,
          }}>
            {row.actor?.role}
          </span>
        </div>
      ),
    },
    {
      title: 'Comment',
      dataIndex: 'comment',
      key: 'comment',
      render: (v) =>
        v ? (
          <span style={{ fontSize: 12, color: THEME.textSecondary, fontStyle: 'italic' }}>"{v}"</span>
        ) : (
          <span style={{ color: THEME.border }}>—</span>
        ),
    },
  ]

  const uniqueActions = [...new Set((data?.events ?? []).map((e) => e.action))]

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: THEME.text, margin: 0 }}>Audit Log</h1>
        <p style={{ fontSize: 13, color: THEME.textSecondary, margin: '4px 0 0' }}>
          Every state change and action on the platform. Updated every 15 seconds.
        </p>
      </div>

      <div style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 12, padding: 20 }}>
        {/* Filters */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <Input
            prefix={<SearchOutlined style={{ color: THEME.textMuted }} />}
            placeholder="Search by item, actor, or comment…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, maxWidth: 400, background: THEME.bg, borderColor: THEME.border, color: THEME.text }}
            allowClear
          />
          <Select
            placeholder="Filter by action"
            value={actionFilter}
            onChange={setActionFilter}
            allowClear
            style={{ width: 200 }}
            options={uniqueActions.map((a) => ({
              value: a,
              label: a.replace(/_/g, ' ').toUpperCase(),
            }))}
          />
          <span style={{ fontSize: 12, color: THEME.textMuted, alignSelf: 'center' }}>
            {events.length} events
          </span>
        </div>

        {isLoading ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <Spin size="large" />
          </div>
        ) : (
          <Table
            dataSource={events}
            columns={columns}
            rowKey="id"
            size="small"
            pagination={{ defaultPageSize: 50, showSizeChanger: true }}
            scroll={{ x: true }}
          />
        )}
      </div>
    </div>
  )
}
