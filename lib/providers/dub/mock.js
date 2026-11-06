export class MockDubProvider {
  async dub({ contentItemId, language }) {
    // Simulate dubbing latency
    await new Promise((resolve) => setTimeout(resolve, 5000))
    return {
      jobId: `mock-dub-${language}-${Date.now()}`,
      fileUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
      durationSec: 45,
    }
  }
}
