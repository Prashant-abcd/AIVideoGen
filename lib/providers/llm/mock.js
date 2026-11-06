const CANNED_SCRIPT = `[INTRO]
Hello everyone! I'm Jigs, and today we're going to learn about something truly amazing — how plants make their own food!

[BODY]
Have you ever wondered how plants survive without eating like we do? The secret is a magical process called Photosynthesis.

Plants have a special green pigment in their leaves called Chlorophyll. When sunlight hits the leaves, chlorophyll captures that energy. The plant then takes in Carbon Dioxide from the air through tiny pores called stomata, and absorbs Water from the soil through its roots.

Using the sun's energy, the plant combines carbon dioxide and water to produce Glucose — which is the plant's food — and releases Oxygen as a by-product. That oxygen is what we breathe!

The simple equation is: Carbon Dioxide + Water + Sunlight → Glucose + Oxygen.

[OUTRO]
So every time you breathe in, thank a plant! Photosynthesis keeps our air clean and feeds almost every living thing on Earth. Amazing, right? Keep exploring with Jigs!`

const REVISED_SCRIPT = `[INTRO]
Namaste! I'm Jigs. Last time I told you about photosynthesis — today I'm back with a clearer, more complete explanation based on your feedback!

[BODY]
Let's start with the BIG question: how do plants make food without eating?

The answer is Photosynthesis — a process that happens inside the green leaves of a plant. Leaves are green because of a special pigment called Chlorophyll. This chlorophyll captures energy from sunlight.

Here's what the plant needs:
• Sunlight — captured by chlorophyll in the leaves
• Carbon Dioxide — absorbed from the air through tiny pores called stomata
• Water — pulled up from the soil through the roots

Using these three ingredients, the plant produces Glucose (its food) and releases Oxygen as a by-product.

Word equation: Carbon Dioxide + Water + Sunlight → Glucose + Oxygen

The glucose is used immediately for energy, or stored as starch for later. The oxygen released? That's what we breathe every day!

[OUTRO]
Photosynthesis is the foundation of almost all life on Earth. No plants, no oxygen, no us! Keep exploring with Jigs!`

export class MockLLMProvider {
  async generateScript({ chapterText, learningOutcome, gradeLevel, format, revisionNotes }) {
    // Simulate LLM latency (slightly longer for revision to feel like rethinking)
    await new Promise((resolve) => setTimeout(resolve, revisionNotes ? 3000 : 2000))
    return {
      scriptText: revisionNotes ? REVISED_SCRIPT : CANNED_SCRIPT,
    }
  }
}
