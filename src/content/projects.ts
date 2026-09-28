// ─────────────────────────────────────────────────────────────────────────────
// PROJECTS — listed on the computer's "Projects" page. All PLACEHOLDER.
// Put cover images in /public/photos and reference them by path.
// ─────────────────────────────────────────────────────────────────────────────

export interface Project {
  id: string
  title: string
  year: string
  kind: string
  role: string
  stack: string[]
  summary: string
  description: string[]
  cover: string
  links: { label: string; href: string }[]
}

export const projects: Project[] = [
  {
    id: 'monsoon-atlas',
    title: 'Monsoon Atlas',
    year: '2025',
    kind: 'Interactive data story',
    role: 'Design & development',
    stack: ['React', 'D3', 'GSAP', 'Vite'],
    summary: 'A scroll-driven atlas of a season of rain.',
    description: [
      'Twelve weeks of rainfall data turned into a single continuous scroll: the map breathes, the axes drift, and the numbers arrive only when you need them.',
      'Built as a small scene graph on top of GSAP so every chart shares one timeline and can be scrubbed in both directions.',
    ],
    cover: '/photos/proj-1.webp',
    links: [{ label: 'Live site', href: 'https://example.com' }, { label: 'Case study', href: 'https://example.com' }],
  },
  {
    id: 'lumen-archive',
    title: 'Lumen Archive',
    year: '2025',
    kind: 'Photo archive',
    role: 'Front-end lead',
    stack: ['TypeScript', 'Next.js', 'Sharp', 'IIIF'],
    summary: 'A quiet, fast archive for 40,000 photographs.',
    description: [
      'Deep-zoom viewing, colour-based browsing and a keyboard-first lightbox, tuned so the interface stays out of the picture’s way.',
      'Images are tiled at build time and streamed progressively.',
    ],
    cover: '/photos/proj-2.webp',
    links: [{ label: 'Live site', href: 'https://example.com' }],
  },
  {
    id: 'signal-board',
    title: 'Signal Board',
    year: '2024',
    kind: 'Product UI',
    role: 'Interaction design & build',
    stack: ['React', 'Zustand', 'Canvas'],
    summary: 'A calm real-time dashboard for a noisy world.',
    description: [
      'Replaced a wall of charts with one opinionated timeline and a small vocabulary of motion for change, alert and rest.',
      'Rendering runs on canvas with a fixed 60fps budget.',
    ],
    cover: '/photos/proj-3.webp',
    links: [{ label: 'Case study', href: 'https://example.com' }],
  },
  {
    id: 'field-notes',
    title: 'Field Notes',
    year: '2024',
    kind: 'Design system',
    role: 'System design',
    stack: ['Figma', 'Tokens', 'React', 'Storybook'],
    summary: 'A warm, typographic design system for editorial teams.',
    description: [
      'Tokens, components and writing guidelines for a small publisher — designed to feel like paper, built to be accessible.',
      'Ships with a motion spec and reduced-motion variants throughout.',
    ],
    cover: '/photos/proj-4.webp',
    links: [{ label: 'Storybook', href: 'https://example.com' }],
  },
  {
    id: 'after-hours',
    title: 'After Hours',
    year: '2023',
    kind: 'Experimental / WebGL',
    role: 'Everything',
    stack: ['Three.js', 'GLSL', 'Web Audio'],
    summary: 'A late-night city rendered in a single fragment shader.',
    description: [
      'A personal experiment in doing as much as possible with as little geometry as possible. Light does the work.',
    ],
    cover: '/photos/proj-5.webp',
    links: [{ label: 'Demo', href: 'https://example.com' }, { label: 'Source', href: 'https://github.com/' }],
  },
]
