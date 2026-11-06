const MOCK_DATA = {
  EN: { views: 8420, avgViewDuration: 38.5, completionPct: 72.3, likes: 341 },
  HI: { views: 6150, avgViewDuration: 35.2, completionPct: 68.1, likes: 287 },
  TA: { views: 3280, avgViewDuration: 33.8, completionPct: 65.4, likes: 143 },
  BN: { views: 2910, avgViewDuration: 31.4, completionPct: 61.7, likes: 119 },
  MR: { views: 2340, avgViewDuration: 30.1, completionPct: 59.2, likes: 98 },
}

export class MockAnalyticsProvider {
  async fetchStats({ language = 'EN' }) {
    const base = MOCK_DATA[language] ?? MOCK_DATA.EN
    // Add small random variance so numbers feel live
    return {
      views: base.views + Math.floor(Math.random() * 100),
      avgViewDuration: parseFloat((base.avgViewDuration + Math.random() * 2).toFixed(1)),
      completionPct: parseFloat((base.completionPct + Math.random() * 2).toFixed(1)),
      likes: base.likes + Math.floor(Math.random() * 10),
    }
  }
}
