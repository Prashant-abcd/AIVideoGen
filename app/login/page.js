'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ConfigProvider, Form, Select, Button, Alert } from 'antd'
import { PlayCircleOutlined } from '@ant-design/icons'
import { THEME, BRAND, ANT_THEME } from '@/lib/theme'

const DEMO_ACCOUNTS = [
  { value: 'coordinator@demo', label: 'Coordinator', desc: 'Create content, manage pipeline, view dashboards' },
  { value: 'sme@demo', label: 'SME Reviewer', desc: 'Review and approve scripts' },
  { value: 'pedagogy@demo', label: 'Pedagogy Reviewer', desc: 'Review rendered videos' },
  { value: 'approver@demo', label: 'Final Approver', desc: 'Final approval before publishing' },
]

export default function LoginPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [form] = Form.useForm()

  async function handleLogin({ email }) {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Login failed')
        return
      }
      router.push(data.redirect)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ConfigProvider theme={ANT_THEME}>
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: THEME.bg,
        position: 'relative',
        overflow: 'hidden',
      }}>

        {/* ── Ambient floating orbs ── */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden',
        }}>
          {/* Gold orb */}
          <div style={{
            position: 'absolute',
            width: 500, height: 500,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(224,145,69,0.08) 0%, transparent 70%)',
            top: '-10%', right: '-5%',
            animation: 'float1 20s ease-in-out infinite',
          }} />
          {/* Teal orb */}
          <div style={{
            position: 'absolute',
            width: 400, height: 400,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(77,187,168,0.06) 0%, transparent 70%)',
            bottom: '-8%', left: '-3%',
            animation: 'float2 25s ease-in-out infinite',
          }} />
          {/* Small warm orb */}
          <div style={{
            position: 'absolute',
            width: 250, height: 250,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(224,145,69,0.05) 0%, transparent 70%)',
            top: '40%', left: '20%',
            animation: 'float3 18s ease-in-out infinite',
          }} />
        </div>

        {/* ── Subtle grain overlay ── */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          opacity: 0.03,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'repeat',
          backgroundSize: '128px 128px',
        }} />

        {/* ── Login card ── */}
        <div style={{
          position: 'relative',
          width: 420,
          background: THEME.surface,
          borderRadius: 20,
          border: `1px solid ${THEME.border}`,
          boxShadow: '0 0 80px rgba(224, 145, 69, 0.04), 0 32px 64px rgba(0, 0, 0, 0.5)',
          padding: '44px 40px 40px',
          zIndex: 1,
        }}>

          {/* ── Logo ── */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            marginBottom: 36,
          }}>
            <div style={{
              width: 42, height: 42,
              background: 'linear-gradient(135deg, #E09145 0%, #4DBBA8 100%)',
              borderRadius: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 16px rgba(224, 145, 69, 0.25)',
            }}>
              <PlayCircleOutlined style={{ color: '#fff', fontSize: 20 }} />
            </div>
            <div>
              <div style={{
                color: THEME.text, fontWeight: 800, fontSize: 18, letterSpacing: -0.3,
                lineHeight: 1.1,
              }}>
                {BRAND.name}
              </div>
              <div style={{ color: THEME.textMuted, fontSize: 11, fontWeight: 500, letterSpacing: 0.3, marginTop: 2 }}>
                Educational Video Pipeline
              </div>
            </div>
          </div>

          {/* ── Welcome text ── */}
          <div style={{ marginBottom: 32 }}>
            <h1 style={{
              fontSize: 26, fontWeight: 800, color: THEME.text,
              lineHeight: 1.2, marginBottom: 8, letterSpacing: -0.5,
            }}>
              Welcome back
            </h1>
            <p style={{
              fontSize: 14, color: THEME.textMuted, lineHeight: 1.5,
            }}>
              Select your role to continue
            </p>
          </div>

          {error && (
            <Alert
              title={error}
              type="error"
              showIcon
              style={{
                marginBottom: 20, borderRadius: 10,
                background: 'rgba(217, 79, 79, 0.08)',
                border: '1px solid rgba(217, 79, 79, 0.25)',
              }}
            />
          )}

          <Form form={form} layout="vertical" onFinish={handleLogin}>
            <Form.Item
              name="email"
              label={<span style={{ fontWeight: 600, fontSize: 13, color: THEME.textSecondary }}>Demo Account</span>}
              rules={[{ required: true, message: 'Please select an account' }]}
            >
              <Select
                size="large"
                placeholder="Choose your role…"
                style={{ width: '100%' }}
                popupClassName="login-select-dropdown"
                options={DEMO_ACCOUNTS.map(({ value, label, desc }) => ({
                  value,
                  label: (
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13, color: THEME.text }}>{label}</div>
                      <div style={{ fontSize: 11, color: THEME.textMuted, marginTop: 1 }}>{desc}</div>
                    </div>
                  ),
                }))}
                optionLabelProp="label"
                styles={{ popup: { root: { padding: 4 } } }}
              />
            </Form.Item>

            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              size="large"
              block
              style={{
                background: 'linear-gradient(135deg, #E09145 0%, #C87D33 100%)',
                border: 'none',
                height: 48,
                fontWeight: 700,
                fontSize: 15,
                borderRadius: 10,
                marginTop: 4,
                boxShadow: '0 4px 16px rgba(224, 145, 69, 0.2)',
                letterSpacing: 0.2,
              }}
            >
              {loading ? 'Signing in…' : 'Continue'}
            </Button>
          </Form>

          {/* ── Subtle footer ── */}
          <div style={{
            marginTop: 28,
            paddingTop: 20,
            borderTop: `1px solid ${THEME.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 11, color: THEME.textMuted }}>
              Demo build · No password required
            </span>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <div style={{
                width: 6, height: 6, borderRadius: '50%',
                background: THEME.success,
                boxShadow: `0 0 6px ${THEME.success}`,
              }} />
              <span style={{ fontSize: 11, color: THEME.textMuted }}>Live</span>
            </div>
          </div>
        </div>
      </div>
    </ConfigProvider>
  )
}
