/**
 * Articles on the rules of B2B prospecting by channel (e-mail, SMS, WhatsApp)
 * and on multichannel sequences. Every rule is taken from the cited official
 * page (CNIL, WhatsApp Business policy, Brevo and Apollo documentation, all
 * read on 2026-10-12); every product fact matches what Phantera ships.
 */

import type { Article } from './blog'
import { AYOUB } from './blog-authors'

const CNIL_EMAIL = { label: 'CNIL, La prospection commerciale par courrier électronique', url: 'https://www.cnil.fr/fr/la-prospection-commerciale-par-courrier-electronique' }
const CNIL_SMS = { label: 'CNIL, La prospection commerciale par SMS-MMS', url: 'https://www.cnil.fr/fr/la-prospection-commerciale-par-sms-mms' }
const WHATSAPP_POLICY = { label: 'WhatsApp, Politique de messagerie WhatsApp Business', url: 'https://whatsappbusiness.com/fr/policy/' }
const BREVO_SMS = { label: 'Brevo, envoi de SMS par API (types transactionnel et marketing)', url: 'https://developers.brevo.com/reference/send-async-transactional-sms' }
const APOLLO_ENRICHMENT = { label: 'Apollo, People Enrichment (coût des numéros)', url: 'https://docs.apollo.io/reference/people-enrichment' }

const NOT_LEGAL_ADVICE = {
  type: 'callout' as const,
  title: 'Ce que cet article n’est pas',
  text: 'Un avis juridique. Il résume les pages officielles citées en sources, lues le 12 octobre 2026. Pour un cas particulier, vérifiez la page à jour ou demandez à un juriste.',
}

export const rulesArticles: Article[] = [
  {
    slug: 'prospection-email-b2b-regles-cnil',
    title: 'Prospection par e-mail en B2B : ce que dit la CNIL, en clair',
    description:
      'Faut-il le consentement d’un professionnel pour lui écrire ? Ce que la CNIL autorise en B2B, les trois conditions à respecter, et le cas des adresses génériques comme contact@.',
    publishedOn: '2026-10-12',
    author: AYOUB,
    topics: ['reglementation', 'delivrabilite'],
    blocks: [
      { type: 'p', text: 'C’est la question qu’on me pose le plus souvent : « J’ai le droit d’écrire à un dirigeant que je ne connais pas ? » En France, entre professionnels, oui, à des conditions précises. Voici ce que dit la CNIL, sans interprétation créative.' },
      { type: 'h2', text: 'Entre professionnels, pas de consentement préalable' },
      { type: 'p', text: 'Pour un particulier, la règle est le consentement préalable : il doit avoir accepté, par une case qu’il coche lui-même, de recevoir vos messages. Pour un professionnel, la CNIL admet que la prospection repose sur l’intérêt légitime, sans consentement préalable, si son objet est en rapport avec la profession de la personne.' },
      { type: 'p', text: 'Écrire à une directrice des achats pour lui présenter un logiciel d’achats : oui. Lui proposer une assurance auto personnelle à son adresse professionnelle : non, ce n’est plus son métier qui est concerné.' },
      { type: 'h2', text: 'Les trois conditions' },
      { type: 'ol', items: [
        'Le message concerne la profession du destinataire.',
        'Il permet de savoir clairement qui l’envoie : votre nom et votre société.',
        'Il permet de refuser simplement les messages suivants, à chaque envoi.',
      ] },
      { type: 'p', text: 'La CNIL ajoute un point souvent oublié : la personne doit être informée de l’utilisation possible de ses coordonnées, y compris quand vous les avez obtenues auprès d’un tiers, par exemple une base de données de prospects. Et une demande d’exercice de ses droits appelle une réponse sous un mois au plus.' },
      { type: 'h2', text: 'Le cas des adresses génériques' },
      { type: 'p', text: 'Les adresses du type contact@, info@ ou commande@ désignent une entreprise, pas une personne. La CNIL indique qu’elles ne sont pas soumises à ces principes. Elles restent soumises au bon sens : une adresse de contact noyée de sollicitations finit par filtrer votre domaine.' },
      { type: 'h2', text: 'Ce que Phantera fait de ces règles' },
      { type: 'ul', items: [
        'Chaque e-mail part depuis votre boîte, à votre nom, avec votre signature : l’expéditeur est identifié.',
        'Un lien de désinscription accompagne les e-mails de campagne, et une désinscription arrête la séquence.',
        'Une réponse du prospect arrête aussi sa séquence, et un lead marqué « Ne plus contacter » ne reçoit plus rien, sur aucun canal.',
      ] },
      { type: 'p', text: 'Le ciblage, lui, reste votre responsabilité : un message qui ne concerne pas le métier du destinataire n’est pas couvert par l’intérêt légitime, quel que soit l’outil.' },
      NOT_LEGAL_ADVICE,
    ],
    faq: [
      { question: 'Faut-il le consentement d’un professionnel pour lui envoyer un e-mail de prospection ?', answer: 'Non, selon la CNIL, si le message est en rapport avec sa profession, identifie l’expéditeur et permet de refuser simplement les messages suivants. Le consentement préalable est la règle pour les particuliers.' },
      { question: 'Les adresses contact@ ou info@ sont-elles concernées ?', answer: 'La CNIL indique que les adresses génériques de personnes morales ne sont pas soumises à ces principes.' },
      { question: 'Que faire si les coordonnées viennent d’une base de données achetée ?', answer: 'La personne doit avoir été informée de l’utilisation possible de ses coordonnées pour de la prospection, y compris quand elles ont été obtenues auprès d’un tiers.' },
    ],
    sources: [CNIL_EMAIL],
  },
  {
    slug: 'prospection-sms-b2b-regles-cnil',
    title: 'Prospection par SMS en B2B : légal, à trois conditions',
    description:
      'Peut-on envoyer des SMS de prospection à des professionnels sans leur accord ? Ce que dit la CNIL, la mention STOP, les horaires, et comment Phantera envoie ces SMS depuis votre compte.',
    publishedOn: '2026-10-12',
    author: AYOUB,
    topics: ['reglementation', 'multicanal'],
    blocks: [
      { type: 'p', text: 'Je l’avoue : pendant la construction de Phantera, nous avons d’abord cru que tout SMS de prospection exigeait l’accord préalable du destinataire. C’est faux pour le B2B. Nous avons corrigé notre lecture, puis notre produit. Voici la règle exacte.' },
      { type: 'h2', text: 'Ce que dit la CNIL' },
      { type: 'p', text: 'Pour la prospection par SMS ou MMS auprès de professionnels, la CNIL admet l’intérêt légitime comme base, sans consentement préalable, lorsque l’objet de la sollicitation est en rapport avec la profession de la personne démarchée. Le consentement préalable reste la règle envers les particuliers.' },
      { type: 'h2', text: 'Les trois conditions' },
      { type: 'ol', items: [
        'Le message concerne le métier du destinataire.',
        'Il permet de connaître l’identité de l’organisation qui l’envoie.',
        'Il permet de refuser simplement les messages suivants.',
      ] },
      { type: 'p', text: 'Comme pour l’e-mail, la personne doit avoir été informée de la possible utilisation de son numéro, y compris si vous l’avez obtenu auprès d’un tiers.' },
      { type: 'h2', text: 'STOP et horaires : ce que fait la passerelle' },
      { type: 'p', text: 'Un SMS de prospection part d’un nom d’expéditeur, par exemple le nom de votre société, auquel on ne peut pas répondre. Le refus passe donc par un code court : « STOP au 36xxx ». Avec Brevo, le message se termine par « STOP au [STOP_CODE] » et la plateforme remplace ce repère par son code court ; c’est elle qui reçoit et traite les STOP. Brevo indique aussi que les SMS marketing ne sont pas envoyés entre 22 h et 8 h, le dimanche et les jours fériés français : ils attendent le prochain créneau autorisé.' },
      { type: 'h2', text: 'Comment Phantera l’applique' },
      { type: 'ul', items: [
        'Vous connectez votre propre compte Brevo : les SMS partent à votre nom d’expéditeur et sont facturés sur votre compte.',
        'Une étape SMS de votre séquence part automatiquement le jour prévu, en SMS marketing, avec la mention STOP.',
        'La première phrase présente l’expéditeur, et le message invite à répondre à l’e-mail déjà envoyé, puisque le SMS n’accepte pas de réponse.',
        'Un STOP passe le lead en « Ne plus contacter » : plus d’e-mail, plus de LinkedIn, plus de SMS.',
        'Sans compte Brevo, l’étape arrive dans votre file « À envoyer » et vous l’envoyez depuis votre téléphone.',
      ] },
      { type: 'callout', title: 'Le vrai risque n’est pas juridique', text: 'Un SMS est intrusif. Un message générique envoyé à un inconnu fait des plaintes, et les opérateurs filtrent les expéditeurs qui en reçoivent. Un SMS court, qui rappelle un e-mail déjà envoyé et pose une seule question, passe beaucoup mieux qu’une annonce.' },
      NOT_LEGAL_ADVICE,
    ],
    faq: [
      { question: 'Faut-il l’accord d’un professionnel pour lui envoyer un SMS de prospection ?', answer: 'Non, selon la CNIL, si le message concerne sa profession, identifie l’organisation qui l’envoie et permet de refuser simplement les messages suivants. L’accord préalable est la règle pour les particuliers.' },
      { question: 'Comment le destinataire peut-il refuser les SMS suivants ?', answer: 'En répondant STOP au code court indiqué en fin de message. Avec Brevo, le message se termine par « STOP au [STOP_CODE] », repère que Brevo remplace par son code court. Dans Phantera, un STOP passe le lead en « Ne plus contacter » sur tous les canaux.' },
      { question: 'À quelles heures partent les SMS de prospection ?', answer: 'Brevo n’envoie pas de SMS marketing entre 22 h et 8 h, le dimanche et les jours fériés français : ils sont décalés au prochain créneau autorisé.' },
    ],
    sources: [CNIL_SMS, BREVO_SMS],
  },
  {
    slug: 'whatsapp-prospection-b2b-regles',
    title: 'WhatsApp en prospection B2B : pourquoi on ne l’automatise pas',
    description:
      'WhatsApp interdit aux entreprises d’écrire à quelqu’un sans son accord préalable, et suspend les comptes qui le font. Ce que dit sa politique, et comment utiliser WhatsApp sans perdre votre numéro.',
    publishedOn: '2026-10-12',
    author: AYOUB,
    topics: ['reglementation', 'multicanal'],
    blocks: [
      { type: 'p', text: 'Quand nous avons ajouté WhatsApp à Phantera, la première demande a été : « Envoie automatiquement à tous les numéros de la liste. » Nous avons refusé. Pas par prudence de principe : parce que la politique de WhatsApp l’interdit, et que la sanction tombe sur votre numéro.' },
      { type: 'h2', text: 'Ce que dit la politique de WhatsApp' },
      { type: 'ul', items: [
        'Une entreprise ne peut contacter une personne sur WhatsApp que si celle-ci lui a donné son accord (« opt-in »).',
        'Les entreprises ne doivent pas solliciter abusivement ni surprendre les personnes.',
        'Elles doivent respecter la volonté de ceux qui bloquent, interrompent ou se désinscrivent.',
        'Les blocages et signalements peuvent limiter le nombre de messages qu’une entreprise peut envoyer.',
        'En cas de manquement, WhatsApp peut limiter ou supprimer l’accès de l’entreprise à ses produits.',
      ] },
      { type: 'p', text: 'Autrement dit, la règle de WhatsApp est plus stricte que la loi française sur l’e-mail ou le SMS en B2B : même un message parfaitement ciblé vers un professionnel exige son accord préalable. Et un compte suspendu, c’est un numéro qui ne sert plus à rien, ni pour vos prospects ni pour vos clients.' },
      { type: 'h2', text: 'Les deux usages qui fonctionnent' },
      { type: 'ol', items: [
        'Laisser le prospect écrire en premier : un lien WhatsApp dans votre signature d’e-mail ouvre une conversation avec vous, message prérempli. C’est lui qui envoie.',
        'Envoyer vous-même, depuis votre téléphone, un message personnel à quelqu’un avec qui vous avez déjà un échange : une relance après un e-mail auquel il a réagi, par exemple.',
      ] },
      { type: 'h2', text: 'Comment Phantera l’applique' },
      { type: 'ul', items: [
        'Le lien WhatsApp de votre signature est suivi : quand un prospect l’ouvre, vous êtes notifié.',
        'Une étape WhatsApp de séquence est rédigée par Phantera puis rangée dans votre file « À envoyer ». Vous l’ouvrez sur votre téléphone, WhatsApp s’ouvre avec le texte, et c’est vous qui appuyez sur Envoyer.',
        'Un plafond quotidien limite le volume, et un lead qui a répondu ou qui est marqué « Ne plus contacter » sort de la file.',
      ] },
      { type: 'callout', title: 'Et l’API officielle ?', text: 'L’API WhatsApp Business permet des envois automatiques, mais seulement vers des personnes qui ont donné leur accord, et hors de la fenêtre de 24 heures qui suit leur dernier message, uniquement avec des modèles approuvés. C’est un outil pour parler à des clients et à des prospects qui ont dit oui, pas pour la prospection à froid.' },
      NOT_LEGAL_ADVICE,
    ],
    faq: [
      { question: 'Peut-on envoyer des messages WhatsApp de prospection automatiques ?', answer: 'Pas à des personnes qui n’ont pas donné leur accord : la politique WhatsApp Business exige un opt-in avant tout contact, et WhatsApp peut limiter ou supprimer l’accès des entreprises qui l’enfreignent.' },
      { question: 'Comment utiliser WhatsApp en prospection B2B sans risque pour son numéro ?', answer: 'En laissant le prospect écrire en premier, par exemple via un lien WhatsApp dans votre signature, ou en envoyant vous-même un message personnel à quelqu’un avec qui vous avez déjà un échange.' },
    ],
    sources: [WHATSAPP_POLICY],
  },
  {
    slug: 'sequence-multicanale-b2b-email-linkedin-sms-whatsapp',
    title: 'Séquence multicanale B2B : e-mail, LinkedIn, SMS et WhatsApp, dans quel ordre ?',
    description:
      'Comment combiner e-mail, LinkedIn, SMS et WhatsApp dans une séquence de prospection B2B sans harceler : le rôle de chaque canal, l’ordre qui respecte le prospect, et un exemple sur deux semaines.',
    publishedOn: '2026-10-12',
    author: AYOUB,
    topics: ['multicanal', 'reglementation'],
    blocks: [
      { type: 'p', text: 'Un prospect ne lit pas tous ses e-mails. Il ne voit pas toutes ses invitations LinkedIn. Multiplier les canaux augmente les chances d’être vu, à une condition : que chaque message ait une raison d’exister. Voici la logique que nous avons retenue dans Phantera.' },
      { type: 'h2', text: 'Le rôle de chaque canal' },
      { type: 'ul', items: [
        'E-mail : le message de fond. Il explique qui vous êtes et pourquoi vous écrivez. C’est le seul canal où l’on peut développer.',
        'LinkedIn : le visage. Le prospect voit votre profil, votre parcours, vos publications. Une invitation courte rend le premier e-mail plus crédible.',
        'SMS : le rappel. Deux phrases qui renvoient à l’e-mail. Utile quand l’e-mail est passé inaperçu, jamais en premier contact.',
        'WhatsApp : la conversation. À réserver aux prospects qui ont écrit en premier ou avec qui un échange existe déjà, parce que la politique de WhatsApp l’impose.',
      ] },
      { type: 'h2', text: 'Les règles de l’ordre' },
      { type: 'ol', items: [
        'Le premier message est un e-mail ou un message LinkedIn : jamais un SMS ou un WhatsApp à quelqu’un qui ne vous connaît pas encore.',
        'Chaque message suivant fait référence au précédent : le prospect doit comprendre d’où vous venez.',
        'Une réponse arrête tout, sur tous les canaux. Un « non merci » ou un STOP aussi.',
        'Deux à trois jours au moins entre deux messages : la relance du lendemain sent l’automate.',
      ] },
      { type: 'h2', text: 'Un exemple sur deux semaines' },
      { type: 'ul', items: [
        'Jour 0 : e-mail personnalisé, une seule question.',
        'Jour 2 : invitation LinkedIn, avec une note courte qui ne répète pas l’e-mail.',
        'Jour 5 : SMS de deux phrases, qui présente l’expéditeur et renvoie à l’e-mail.',
        'Jour 9 : dernier e-mail, plus court, qui laisse une porte ouverte.',
      ] },
      { type: 'p', text: 'Si le prospect ouvre la conversation WhatsApp depuis votre signature, vous êtes prévenu et c’est vous qui reprenez la main, depuis votre téléphone.' },
      { type: 'h2', text: 'Et les numéros de téléphone ?' },
      { type: 'p', text: 'Une base comme Apollo peut fournir le numéro professionnel d’un prospect, mais c’est payant : sa documentation indique 8 crédits quand un mobile est trouvé. Dans Phantera, la recherche de numéro est une option, plafonnée chaque mois, et elle ne se fait que pour les leads dont la séquence contient une étape SMS ou WhatsApp. Sans numéro, l’étape est simplement passée et la séquence continue.' },
      { type: 'callout', title: 'À retenir', text: 'Un canal de plus n’est pas un message de plus. C’est une autre façon de dire la même chose, au bon moment, à quelqu’un qui peut vous arrêter d’un mot.' },
    ],
    faq: [
      { question: 'Dans quel ordre utiliser les canaux d’une séquence de prospection B2B ?', answer: 'Commencez par un e-mail ou un message LinkedIn, ajoutez ensuite un SMS court qui renvoie à l’e-mail, et réservez WhatsApp aux prospects qui ont écrit en premier. Une réponse arrête la séquence sur tous les canaux.' },
      { question: 'Combien de temps laisser entre deux messages ?', answer: 'Au moins deux à trois jours : une relance trop rapide paraît automatique et fait baisser les réponses.' },
    ],
    sources: [CNIL_EMAIL, CNIL_SMS, WHATSAPP_POLICY, APOLLO_ENRICHMENT],
  },
]
