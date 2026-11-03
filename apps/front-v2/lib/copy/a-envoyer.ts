/** Texts of the "À envoyer" screen (/dashboard/a-envoyer), word for word from body n°1 (PhoneQueueClient). */

const s = (n: number) => (n > 1 ? 's' : '')

export const aEnvoyerCopy = {
  title: 'À envoyer',
  summary: (count: number, done: number, remaining: number) => [
    `${count} message${s(count)} WhatsApp / SMS`,
    done > 0 ? `${done} envoyé${s(done)}` : null,
    `${remaining} restant${s(remaining)} aujourd’hui`,
  ].filter(Boolean).join(' · '),
  intro: "Ouvrez cette page sur votre téléphone. Chaque bouton ouvre WhatsApp ou vos SMS avec le message prêt : vous l'envoyez, la séquence continue. Les SMS partent seuls si votre compte Brevo est connecté (Paramètres, onglet E-mails et canaux) ; les WhatsApp passent toujours par vous.",
  emptyTitle: "Rien à envoyer pour l'instant",
  emptyBody: 'Les étapes WhatsApp et SMS de vos campagnes arrivent ici le jour prévu.',
  listLabel: 'Messages à envoyer',
  message: (name: string) => `Message pour ${name}`,
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  openWhatsapp: 'Ouvrir WhatsApp',
  openSms: 'Ouvrir les SMS',
  skip: 'Passer',
  notRecorded: 'Envoi non enregistré',
  skipFailed: 'Impossible de passer ce message',
} as const
