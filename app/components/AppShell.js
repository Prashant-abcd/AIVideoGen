'use client'

import { useRouter, usePathname } from 'next/navigation'
import { ConfigProvider, Layout, Menu, Button, Avatar, Dropdown, Badge } from 'antd'
import {
  PlayCircleOutlined,
  AppstoreOutlined,
  PlusOutlined,
  BarChartOutlined,
  FileTextOutlined,
  CheckSquareOutlined,
  UserOutlined,
  LogoutOutlined,
} from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { THEME, BRAND, ANT_THEME } from '@/lib/theme'

const { Header, Content } = Layout

const COORDINATOR_NAV = [
  { key: '/board', label: 'Pipeline Board', icon: <AppstoreOutlined /> },
  { key: '/create', label: 'Create Content', icon: <PlusOutlined /> },
  { key: '/dashboard', label: 'Dashboard', icon: <BarChartOutlined /> },
  { key: '/audit', label: 'Audit Log', icon: <FileTextOutlined /> },
]

const REVIEWER_NAV = [
  { key: '/review', label: 'Review Queue', icon: <CheckSquareOutlined /> },
]

const ROLE_LABELS = {
  COORDINATOR: 'Coordinator',
  SME: 'SME Reviewer',
  PEDAGOGY: 'Pedagogy Reviewer',
  APPROVER: 'Final Approver',
}

export default function AppShell({ user, children }) {
  const router = useRouter()
  const pathname = usePathname()

  const nav = user.role === 'COORDINATOR' ? COORDINATOR_NAV : REVIEWER_NAV

  // Badge count: open tasks for reviewers
  const { data: taskData } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => fetch('/api/tasks').then((r) => r.json()),
    refetchInterval: 10000,
    enabled: user.role !== 'COORDINATOR',
  })
  const taskCount = taskData?.tasks?.length ?? 0

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  const userMenu = {
    items: [
      {
        key: 'logout',
        icon: <LogoutOutlined />,
        label: 'Sign out',
        danger: true,
      },
    ],
    onClick: ({ key }) => {
      if (key === 'logout') handleLogout()
    },
  }

  // Active menu key: match on prefix
  const activeKey = nav.find((n) => pathname.startsWith(n.key))?.key ?? nav[0]?.key

  return (
    <ConfigProvider theme={ANT_THEME}>
      <Layout style={{ minHeight: '100vh', background: THEME.bg }}>
        <Header
          style={{
            background: THEME.surface,
            borderBottom: `1px solid ${THEME.border}`,
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            gap: 0,
            position: 'sticky',
            top: 0,
            zIndex: 100,
            boxShadow: '0 4px 24px rgba(12, 10, 8, 0.5)',
          }}
        >
          {/* Logo */}
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 32, cursor: 'pointer' }}
            onClick={() => router.push(user.role === 'COORDINATOR' ? '/board' : '/review')}
          >
            <div
              style={{
                width: 32, height: 32,
                background: 'linear-gradient(135deg, #E09145 0%, #4DBBA8 100%)',
                borderRadius: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <PlayCircleOutlined style={{ color: '#fff', fontSize: 14 }} />
            </div>
            <span style={{ color: THEME.text, fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', letterSpacing: 0.2 }}>
              {BRAND.name}
            </span>
          </div>

          {/* Navigation */}
          <Menu
            theme="dark"
            mode="horizontal"
            selectedKeys={[activeKey]}
            style={{
              flex: 1,
              background: 'transparent',
              borderBottom: 'none',
              minWidth: 0,
            }}
            items={nav.map((item) => ({
              key: item.key,
              icon: item.icon,
              label:
                item.key === '/review' && taskCount > 0 ? (
                  <Badge count={taskCount} offset={[6, -2]} size="small" color={THEME.accent}>
                    <span style={{ color: 'inherit', paddingRight: 8 }}>{item.label}</span>
                  </Badge>
                ) : (
                  item.label
                ),
              onClick: () => router.push(item.key),
              style: { color: THEME.textSecondary },
            }))}
          />

          {/* User */}
          <Dropdown menu={userMenu} placement="bottomRight" trigger={['click']}>
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                cursor: 'pointer',
                padding: '4px 8px',
                borderRadius: 8,
                background: THEME.surfaceHover,
              }}
            >
              <Avatar size={28} icon={<UserOutlined />} style={{ background: THEME.primary, fontSize: 13 }} />
              <div style={{ lineHeight: 1.2 }}>
                <div style={{ color: THEME.text, fontSize: 13, fontWeight: 600 }}>{user.name}</div>
                <div style={{ color: THEME.textMuted, fontSize: 11 }}>
                  {ROLE_LABELS[user.role]}
                </div>
              </div>
            </div>
          </Dropdown>
        </Header>

        <Content style={{ padding: '24px', maxWidth: 1400, width: '100%', margin: '0 auto' }}>
          {children}
        </Content>
      </Layout>
    </ConfigProvider>
  )
}
