/** The cover of each blog article: one credited photograph that names its subject (CREDITS.md). */
const unsplash = (slug: string) => `https://unsplash.com/photos/${slug}`

export interface BlogCover {
  src: string
  width: number
  height: number
  alt: string
  author: string
  page: string
}

const COVERS = {
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
} as const satisfies Record<string, BlogCover>

export const ARTICLE_COVERS: Record<string, BlogCover> = {
  'prospection-email-b2b-regles-cnil': COVERS.cnilEnvelopes,
  'prospection-sms-b2b-regles-cnil': COVERS.sms,
  'whatsapp-prospection-b2b-regles': COVERS.whatsappPhone,
  'sequence-multicanale-b2b-email-linkedin-sms-whatsapp': COVERS.sequenceCalendar,
  '1000-e-mails-depuis-une-seule-boite': COVERS.envelopeWall,
  'campagne-muette-tests-verts': COVERS.silentStreet,
}
