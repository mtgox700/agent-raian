/** Editorial photographs, credited where they stand (CREDITS.md). */
const unsplash = (slug: string) => `https://unsplash.com/photos/${slug}`

export const PHOTOS = {
  signature: {
    src: '/photos/signature.jpg', width: 1377, height: 2000,
    alt: 'Une lampe de bureau éclaire un carnet ouvert, écrit à la main, et un stylo, dans une pièce sombre.',
    author: 'Barney Goodman', page: unsplash('a-lit-desk-lamp-illuminates-a-notebook-and-pen-LOk7sNVCNJU'),
  },
  reply: {
    src: '/photos/reply.jpg', width: 2000, height: 1333,
    alt: 'Dans le noir, un homme regarde l’écran allumé de son téléphone, la ville floue derrière lui.',
    author: 'Shubham Sharan', page: unsplash('man-in-black-shirt-holding-white-smartphone-1rJdewJPCWE'),
  },
} as const
export type PhotoKey = keyof typeof PHOTOS
