/**
 * Every photograph the marketing site shows, in one place: what it is, what
 * it says, who took it. All from Unsplash under the Unsplash License (free to
 * use, credit appreciated), chosen in the browser on 2026-10-25 for what they
 * mean in their section (.war-room/design/PHOTO_BRIEF.md). No person in them
 * is presented as a customer. Credited in apps/web/CREDITS.md.
 */

export interface Photo {
  src: string
  width: number
  height: number
  /** What a reader who cannot see it needs to know. */
  alt: string
  author: string
  /** The photo's page on Unsplash (licence and author). */
  page: string
}

const unsplash = (slug: string) => `https://unsplash.com/photos/${slug}`

export const PHOTOS = {
  signature: {
    src: '/photos/signature.jpg', width: 1377, height: 2000,
    alt: 'Une lampe de bureau éclaire un carnet ouvert, écrit à la main, et un stylo, dans une pièce sombre.',
    author: 'Barney Goodman', page: unsplash('a-lit-desk-lamp-illuminates-a-notebook-and-pen-LOk7sNVCNJU'),
  },
  founderDesk: {
    src: '/photos/founder-desk.jpg', width: 2000, height: 1333,
    alt: 'Un bureau en bois la nuit, sous une lampe articulée : un ordinateur fermé, des lunettes, des stylos.',
    author: 'Beth Stevenson', page: unsplash('black-desk-lamp-on-brown-wooden-table-okUB5th8QtQ'),
  },
  reply: {
    src: '/photos/reply.jpg', width: 2000, height: 1333,
    alt: 'Dans le noir, un homme regarde l’écran allumé de son téléphone, la ville floue derrière lui.',
    author: 'Shubham Sharan', page: unsplash('man-in-black-shirt-holding-white-smartphone-1rJdewJPCWE'),
  },
  fog: {
    src: '/photos/fog.jpg', width: 2000, height: 1333,
    alt: 'Une forêt de grands arbres sombres dans un brouillard épais.',
    author: 'Chris Barbalis', page: unsplash('green-trees-with-fog-during-daytime-QDPo00WyGXg'),
  },
  pilot: {
    src: '/photos/pilot.jpg', width: 2000, height: 1333,
    alt: 'Une tasse de café et un carnet noir posés sur une table sombre.',
    author: 'Marek Levák', page: unsplash('white-cup-of-coffee-on-black-surface-s7nJkRQnUy8'),
  },
  cnilEnvelopes: {
    src: '/photos/cnil-envelopes.jpg', width: 2000, height: 1333,
    alt: 'Des enveloppes anciennes ouvertes, adressées à la machine à écrire.',
    author: 'Sue Hughes', page: unsplash('opened-envelopes-toQNPpuDuwI'),
  },
  envelopeWall: {
    src: '/photos/envelope-wall.jpg', width: 2000, height: 1333,
    alt: 'Un mur couvert de centaines d’enveloppes par avion numérotées.',
    author: 'Carol Jeng', page: unsplash('envelope-lot-6O7EkAgC-3s'),
  },
  sms: {
    src: '/photos/sms.jpg', width: 1339, height: 2000,
    alt: 'Une main tient un téléphone dont l’écran éclaire seul une pièce plongée dans le noir.',
    author: 'Akshar Dave', page: unsplash('person-holding-blue-light-in-dark-room-sgNc8aY6Z7E'),
  },
  sequenceCalendar: {
    src: '/photos/sequence-calendar.jpg', width: 2000, height: 1333,
    alt: 'Un téléphone affichant un calendrier, posé près d’un clavier d’ordinateur.',
    author: 'Ales Nesetril', page: unsplash('black-android-smartphone-S7sZReI6hJI'),
  },
  whatsappPhone: {
    src: '/photos/whatsapp-phone.jpg', width: 2000, height: 1333,
    alt: 'Un téléphone éteint posé sur une table en bois, écran noir.',
    author: 'Olga Nayda', page: unsplash('turned-off-black-and-silver-smartphone-on-brown-wooden-board-cSskyN592g8'),
  },
  silentStreet: {
    src: '/photos/silent-street.jpg', width: 2000, height: 1333,
    alt: 'Une rue résidentielle vide, la nuit, éclairée par quelques réverbères.',
    author: 'Ronan Furuta', page: unsplash('streetlights-illuminate-a-dark-suburban-street-at-night-IUCq3D25hVc'),
  },
  fork: {
    src: '/photos/fork.jpg', width: 1499, height: 2000,
    alt: 'Vue du ciel, une route qui se sépare en deux au milieu d’une forêt dense.',
    author: 'Tom Parsons', page: unsplash('top-view-photography-of-forest-F5qVefeCrp8'),
  },
} as const satisfies Record<string, Photo>

export type PhotoKey = keyof typeof PHOTOS

/** The cover of each blog article: one photo that names its subject. */
export const ARTICLE_COVERS: Record<string, PhotoKey> = {
  'prospection-email-b2b-regles-cnil': 'cnilEnvelopes',
  'prospection-sms-b2b-regles-cnil': 'sms',
  'whatsapp-prospection-b2b-regles': 'whatsappPhone',
  'sequence-multicanale-b2b-email-linkedin-sms-whatsapp': 'sequenceCalendar',
  '1000-e-mails-depuis-une-seule-boite': 'envelopeWall',
  'campagne-muette-tests-verts': 'silentStreet',
}
