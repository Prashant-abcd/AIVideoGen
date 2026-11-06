import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../app/generated/prisma/client.ts'
import { config } from 'dotenv'

config()

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('Seeding database...')

  // ---------------------------------------------------------------------------
  // 1. Users — 4 hardcoded demo accounts
  // ---------------------------------------------------------------------------
  const users = await Promise.all([
    prisma.user.upsert({
      where: { email: 'coordinator@demo' },
      update: {},
      create: { name: 'Coordinator', email: 'coordinator@demo', role: 'COORDINATOR' },
    }),
    prisma.user.upsert({
      where: { email: 'sme@demo' },
      update: {},
      create: { name: 'SME Reviewer', email: 'sme@demo', role: 'SME' },
    }),
    prisma.user.upsert({
      where: { email: 'pedagogy@demo' },
      update: {},
      create: { name: 'Pedagogy Reviewer', email: 'pedagogy@demo', role: 'PEDAGOGY' },
    }),
    prisma.user.upsert({
      where: { email: 'approver@demo' },
      update: {},
      create: { name: 'Final Approver', email: 'approver@demo', role: 'APPROVER' },
    }),
    // System user for automated audit events
    prisma.user.upsert({
      where: { email: 'system@demo' },
      update: {},
      create: { name: 'System', email: 'system@demo', role: 'COORDINATOR' },
    }),
  ])
  console.log(`✓ ${users.length} users seeded`)

  // ---------------------------------------------------------------------------
  // 2. Chapters — Class 7 Science, Curiosity Textbook (New Syllabus 2024)
  // ---------------------------------------------------------------------------
  const chapter10 = await prisma.chapter.upsert({
    where: { id: 'chapter-curiosity-7-10' },
    update: {},
    create: {
      id: 'chapter-curiosity-7-10',
      classLevel: 'Grade 7',
      subject: 'Science',
      chapterName: 'Life Processes in Plants',
      learningOutcomes: [
        'Explains the role of sunlight, water, chlorophyll, and carbon dioxide in plant growth and photosynthesis.',
        'Identifies leaves as the primary site for food production and gas exchange in plants.',
        'Describes the transport of water and minerals through the xylem, and food through the phloem.',
        'Illustrates the process of respiration in plants, involving the intake of oxygen and release of carbon dioxide to produce energy.',
      ],
      chapterText: `Life Processes in Plants

In Grade 6, we learnt that all living beings grow and need food for their growth. We know that animals eat food to grow, but what about plants? Food provides nutrients like carbohydrates, fats, proteins, vitamins, and minerals, which, along with water, are all essential for growth.

10.1 How Do Plants Grow?
As a plant grows, new leaves and branches emerge, its height increases, and its stem thickens. Plants require both sunlight and water for their growth.

10.2 How Do Plants Get Food for their Growth?
Unlike animals, plants do not eat food.

10.2.1 Leaves: the 'food factories' of plants
Plants store food in the form of starch, a type of carbohydrate. This starch is produced in the leaves of a plant which, by design, are generally broad and flat. These are mostly green because of the presence of a green pigment called chlorophyll, that helps in capturing sunlight efficiently. Chlorophyll helps in preparing starch in the presence of sunlight. In fact, it is essential for the preparation of starch. Hence, the leaves are also called 'food factories' of plants.

Fascinating Facts: "Trees do not produce fruits and flowers merely because they are planted." This line is from an ancient Indian text named Vrikshayurveda. It records useful observations about plant growth, soil, and agricultural practices to help improve crop health, growth and production.

Some plant leaves appear red, violet, or brown because they contain more of these coloured pigments than the green-coloured chlorophyll. This hides the green colour. Some of these pigments also help in photosynthesis.

10.2.2 Role of air in the preparation of food
Carbon dioxide present in the air is essential for plants to prepare starch. Sunlight, water, chlorophyll and carbon dioxide are essential for the synthesis of food in plants. This process by which plants prepare food in the presence of sunlight and chlorophyll is called photosynthesis. A leaf is the primary site for photosynthesis. Other parts of the plants which have chlorophyll also perform photosynthesis. Oxygen is released during photosynthesis.

10.2.3 Photosynthesis: in a nutshell
During photosynthesis, food is actually produced in the form of glucose, a simple carbohydrate. This glucose not only serves as an instant source of energy but also later gets converted into starch for storage.

Word equation: Carbon dioxide + Water (Sunlight, Chlorophyll) → Glucose + Oxygen

Know a Scientist: Rustom Hormusji Dastur (1896–1961) was a plant scientist who studied the process of photosynthesis. He examined the importance of water, temperature, and the colour of light in the process of photosynthesis.

10.2.4 How do leaves exchange gases during photosynthesis?
These pores are called stomata. Stomata, present on the surface of leaves, help in the exchange of gases.

10.3 Transport in Plants

10.3.1 Transport of water and minerals
Water, along with minerals present in the soil, is taken up by the roots of a plant. Minerals are important nutrients for the growth of plants. Minerals dissolved in water also move up the stem through the xylem. Water and minerals are transported to the leaves and other parts of plants through the xylem.

10.3.2 Transport of food
The food prepared by plants in the leaves is transported to all parts of the plant. This food is transported through another set of thin tube-like structures called the phloem. The transported food may also be stored in some other parts of a plant, such as seeds and roots.

10.4 Do Plants Respire?
All parts of a plant, green or non-green, carry out respiration. During respiration, glucose is broken down in the presence of oxygen, releasing carbon dioxide, water, and energy.

Word equation: Glucose + Oxygen → Carbon dioxide + Water + Energy

The energy produced during respiration is used by plants for their growth and development. Thus, plants have different mechanisms for synthesising, transporting, and utilising food to get energy.`,
    },
  })

  const chapter12 = await prisma.chapter.upsert({
    where: { id: 'chapter-curiosity-7-12' },
    update: {},
    create: {
      id: 'chapter-curiosity-7-12',
      classLevel: 'Grade 7',
      subject: 'Science',
      chapterName: 'Earth, Moon, and the Sun',
      learningOutcomes: [
        'Explains the concept of Earth\'s rotation from West to East and how it causes the apparent daily motion of the Sun, Moon, and stars, as well as the cycle of day and night.',
        'Describes the revolution of the Earth around the Sun and its effect on the changing visibility of star patterns in the night sky throughout the year.',
        'Identifies the reasons for seasons on Earth, attributing them to the tilt of the Earth\'s axis of rotation and its spherical shape, rather than its distance from the Sun.',
        'Illustrates the geometry of solar and lunar eclipses, explaining how the Moon\'s apparent size allows it to block the Sun and how the Earth\'s shadow obscures the Moon.',
        'Details safe practices for viewing a solar eclipse, emphasising the danger of looking directly at the Sun and recommending supervised events.',
      ],
      chapterText: `Earth, Moon, and the Sun

One morning in Kanniyakumari, Tamil Nadu, 12-year-old Rashmika was eagerly cycling to school. She noticed that coconut tree shadows were long in the morning but shorter in the afternoon. She wondered—does the Sun move in the sky? Or does the Earth move?

12.1 Rotation of the Earth
The Sun rises in the East and sets in the West. The Earth spins (or rotates) on its own axis in space. Rotation is the motion of an object in which all its parts move in circles around an imaginary line that passes through it. This line is called the axis of rotation. The Earth's axis of rotation passes through its geographic North Pole and the South Pole. The Earth completes one rotation in about 24 hours. When viewed from the top of the North Pole, the Earth is rotating in the anti-clockwise direction, that is, from West to East.

The light falls on the eastern part first when the globe rotates from West to East. Sunrise occurs as your location moves into light and sunset occurs as it moves into darkness. The Earth's rotation from West to East causes the day-night cycle. The side facing the Sun experiences daytime, while the other side experiences night.

Due to the rotation of the Earth, the Sun appears to rise in the eastward direction, move across the sky from the East to the West and set in the westward direction.

Fascinating Facts: In the middle of the nineteenth century, scientist Leon Foucault used a long pendulum to give the first simple demonstration of the Earth's rotation. A Foucault pendulum with a length of 22 metres has been hung from a skylight in the Constitution Hall of the new Parliament building in New Delhi, India.

Ancient Indian astronomers, including Aryabhata, had noticed the daily apparent motion of the celestial objects. Aryabhata's stated value for the time taken by the Earth to complete one full rotation is around 23 hours 56 minutes 4.1 seconds, which is impressively close to the currently accepted value.

Since the Earth is rotating, the stars also appear to move in the sky like the Sun. The Earth's axis of rotation points very close to the Pole Star in the Northern Hemisphere. Therefore, the Pole Star appears nearly stationary in the sky. All the stars appear to move around it.

12.2 Revolution of the Earth
While rotating on its own axis, the Earth also revolves around the Sun. Revolution is the motion of an object around another object. The Earth completes one revolution around the Sun in about 365 days and 6 hours.

12.2.1 Changing view of night sky from the Earth
As the Earth also revolves around the Sun continuously, the stars seen in the night sky after sunset gradually change over a year as we look in different directions.

12.2.2 Seasons on the Earth
The Earth's axis of rotation is tilted with respect to its orbit. The tilt of the Earth's axis and the spherical shape of the Earth give rise to seasons.

In June, the Northern Hemisphere is tilted towards the Sun and experiences summer. In December, the situation is reversed and the Northern Hemisphere experiences winter. The Northern Hemisphere's longest day occurs around 21 June (summer solstice) and shortest day around 22 December (winter solstice). Around 21 March and 23 September are the equinoxes when daytime lasts 12 hours.

12.3 Eclipses

12.3.1 Solar Eclipse
At certain times, the Moon can come in between the Sun and the Earth, blocking sunlight from reaching us. This is known as a solar eclipse. The apparent sizes of the Moon and the Sun in the sky are similar when viewed from the Earth because although the Moon is much smaller, it is much closer to us. Therefore, the Moon can appear to cover the entire Sun.

The shadow of the Moon falls on a small area on Earth's surface. Observers in this area witness a total solar eclipse. In areas where the Moon partially blocks the Sun, observers see a partial solar eclipse.

Safe Viewing of a Solar Eclipse: Directly viewing a solar eclipse must be strictly avoided as the Sun is intense enough to damage the eyes and cause blindness. Do not view it through sunglasses, binoculars, or telescopes. Participating in supervised events with specialised eye protection is the safest way.

12.3.2 Lunar Eclipse
As the Moon revolves around the Earth, sometimes the Earth blocks sunlight from reaching the Moon. This is known as a lunar eclipse. When the Moon is completely in the Earth's shadow, it is a total lunar eclipse and the Moon appears dark red. When part of the Moon is in the Earth's shadow, it is a partial lunar eclipse. Unlike the Sun, we can safely watch the eclipsed Moon with the naked eye.`,
    },
  })

  console.log(`✓ 2 chapters seeded (Chapter 10: Life Processes in Plants, Chapter 12: Earth, Moon, and the Sun)`)
  console.log('\nSeed complete.')
  console.log('\nDemo accounts:')
  console.log('  coordinator@demo')
  console.log('  sme@demo')
  console.log('  pedagogy@demo')
  console.log('  approver@demo')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
