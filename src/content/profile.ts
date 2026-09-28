// ─────────────────────────────────────────────────────────────────────────────
// PROFILE / CV — shown inside the old computer. All copy is PLACEHOLDER.
// ─────────────────────────────────────────────────────────────────────────────

export const about = {
  headline: 'I build things that move — and photograph the things that don’t.',
  paragraphs: [
    'I’m a creative developer working at the seam of interaction design, motion and photography. I like interfaces that feel physical: considered easing, honest materials, a bit of weight.',
    'Most days that means prototyping in the browser, tuning animation curves until they feel right, and then walking out with a camera to reset my eyes.',
  ],
  facts: [
    ['Based in', 'Kochi, India'],
    ['Focus', 'Interactive web · Motion · Photography'],
    ['Currently', 'Open to select freelance work'],
    ['Reach me', 'hello@example.com'],
  ] as [string, string][],
}

export const skills = [
  {
    title: 'Development',
    items: ['React & TypeScript', 'GSAP / ScrollTrigger', 'WebGL & Three.js', 'Node.js', 'Vite / Next.js', 'Accessibility & performance'],
  },
  {
    title: 'Design & Motion',
    items: ['Interaction design', 'Motion design', 'Prototyping', 'Design systems', 'Figma', 'Typography'],
  },
  {
    title: 'Photo & Video',
    items: ['Street & travel photography', 'Lightroom / colour', 'Premiere / DaVinci', 'Short-form storytelling', 'Analog film'],
  },
]

export interface Job {
  role: string
  org: string
  period: string
  points: string[]
}

export const cv = {
  /** put your PDF in /public (e.g. /public/cv.pdf) and set this to '/cv.pdf'. Empty = no download button. */
  pdf: '',
  experience: [
    {
      role: 'Creative Developer',
      org: 'Studio Name',
      period: '2024 — Present',
      points: ['Led front-end for award-nominated interactive campaigns.', 'Built a shared motion toolkit used across five projects.'],
    },
    {
      role: 'Front-end Developer',
      org: 'Company Name',
      period: '2022 — 2024',
      points: ['Shipped a React design system and component library.', 'Cut LCP by 40% on the main product surface.'],
    },
    {
      role: 'Freelance Photographer & Editor',
      org: 'Self-employed',
      period: '2019 — Present',
      points: ['Travel, street and event work for independent brands.'],
    },
  ] as Job[],
  education: [{ title: 'B.Tech, Computer Science', org: 'University Name', period: '2016 — 2020' }],
  extras: [
    ['Recognition', 'Site of the Day — Placeholder Awards, 2025'],
    ['Talks', 'Motion on the web — Local Meetup, 2024'],
    ['Languages', 'English · Malayalam · Hindi'],
  ] as [string, string][],
}
