// ─────────────────────────────────────────────────────────────────────────────
// SITE-WIDE TEXT — edit freely. Everything here is placeholder copy.
// ─────────────────────────────────────────────────────────────────────────────

export const site = {
  name: 'SIDHARTH',
  role: 'Creative Developer / Photographer',
  location: 'Kochi, India',
  scrollHint: 'Scroll to explore',
  email: 'hello@example.com', // PLACEHOLDER
  links: [
    { label: 'Instagram', href: 'https://instagram.com/' }, // PLACEHOLDER
    { label: 'GitHub', href: 'https://github.com/' }, // PLACEHOLDER
    { label: 'LinkedIn', href: 'https://linkedin.com/' }, // PLACEHOLDER
  ],
  /** Chapter captions (bottom-left film subtitles). `key` matches the chapter ids in animation/chapters.ts */
  captions: {
    room: { index: '01', title: 'The room', line: 'Come in. Take a look around.' },
    desk: { index: '02', title: 'The desk', line: 'Where most of it happens.' },
    pc: { index: '03', title: 'The computer', line: 'CV, skills & projects.' },
    camera: { index: '04', title: 'The camera', line: 'Photography & motion.' },
    wall: { index: '05', title: 'The wall', line: 'Hover a frame. Click to look closer.' },
    outro: { index: '06', title: 'Say hello', line: 'Thanks for stopping by.' },
  },
} as const
