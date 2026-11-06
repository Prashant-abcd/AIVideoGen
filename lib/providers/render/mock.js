export class MockRenderProvider {
  async render({ scriptText, contentItemId }) {
    // Simulate render latency (real Runway pipeline takes minutes)
    await new Promise((resolve) => setTimeout(resolve, 5000))
    return {
      jobId: `mock-render-${Date.now()}`,
      fileUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
      durationSec: 45,
    }
  }
}
