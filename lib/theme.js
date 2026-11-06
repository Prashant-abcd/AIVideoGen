export const THEME = {
  // ── Warm noir backgrounds ──
  bg: '#0C0A08',
  surface: '#171310',
  surfaceHover: '#231D17',
  border: '#362D23',

  // ── Burnished gold primary ──
  primary: '#E09145',
  primaryMid: '#C87D33',
  primaryLight: 'rgba(224, 145, 69, 0.10)',

  // ── Muted teal accent ──
  accent: '#4DBBA8',
  accentLight: 'rgba(77, 187, 168, 0.10)',

  // ── Semantic ──
  success: '#5CB868',
  warning: '#E5B84C',
  error: '#D94F4F',

  // ── Warm cream text ──
  text: '#F2ECE2',
  textSecondary: '#ADA196',
  textMuted: '#756B62',
  textInverse: '#0C0A08',
}

export const BRAND = {
  name: 'ReelLearn AI',
  tagline: 'AI-powered multilingual educational videos',
  mascot: 'Jigs',
}

import { theme } from 'antd'

export const ANT_THEME = {
  token: {
    colorPrimary: THEME.primary,
    colorLink: THEME.accent,
    borderRadius: 8,
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    colorBgBase: THEME.bg,
    colorTextBase: THEME.text,
    colorBorder: THEME.border,
    colorBgContainer: THEME.surface,
    colorBgElevated: THEME.surfaceHover,
  },
  algorithm: theme.darkAlgorithm,
}
