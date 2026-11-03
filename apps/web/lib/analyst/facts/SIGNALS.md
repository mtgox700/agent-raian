# Signaux de l'Analyste : ce que Phantera sait d'une campagne, et ce que cela ne prouve pas

E2, 2026-10-17. Relu sur `prisma/schema.prisma` (main, eb553d3). La règle d'Okafor : un signal n'entre dans une conclusion qu'avec sa limite.

## Envois (`EmailSend`)
Une ligne par lead et par étape (unique `leadId` + `emailStepId`).

| Signal | Source | Limite |
|---|---|---|
| En file | `status = PENDING` | Une file non vide ne dit pas pourquoi elle attend : la raison se lit dans `lib/sequences/send-status.ts` (CAMPAIGN_PAUSED, QUOTA, MAILBOX_DISCONNECTED, NO_SENDER, MAILBOX_PAUSED, MAILBOX_CAP, SHARED_CAP) |
| En cours | `SENDING` | Au-delà de 10 min (`SENDING_STALE_MS`), le travailleur est mort : l'issue est inconnue |
| Envoyé | `SENT_STATUSES` = SENT, DELIVERED, OPENED, CLICKED ; `sentAt` | « Envoyé » ne veut pas dire « reçu » : seul le statut DELIVERED, sur le domaine partagé Resend, l'atteste. Gmail, Outlook et SMTP n'envoient pas d'accusé de livraison |
| Délivré | `DELIVERED` (webhook Resend) | N'existe que pour le domaine partagé ; absent ≠ non délivré |
| Ouvert | `OPENED`, `openedAt` (pixel, webhook Resend) | **Signal faible** : la protection de la vie privée d'Apple Mail et les scanners de sécurité ouvrent les e-mails sans lecteur humain. Le blocage des images sous Outlook masque de vraies lectures. Jamais seul dans une conclusion |
| Cliqué | `CLICKED`, `clickedAt` | Les scanners de liens (Safe Links) cliquent aussi. Rare dans un e-mail de prospection sans lien |
| Rebond | `BOUNCED` ; rebonds IMAP rapprochés par `poll-inboxes` | Les rebonds asynchrones arrivent jusqu'à plusieurs jours après l'envoi : un taux mesuré à J+1 est sous-estimé |
| Échec | `FAILED`, `attempts`, `errorMessage` | Échec du fournisseur ou de la configuration, pas du destinataire |
| À envoyer depuis le téléphone | `AWAITING_USER` (WhatsApp, SMS) | Dépend de l'utilisateur : ce n'est pas un envoi |
| Passé | `SKIPPED` | Étape sans numéro ou ignorée : la séquence continue |
| Boîte d'envoi | `mailboxId` (null = domaine partagé) | Les envois antérieurs au suivi par boîte n'en ont pas |

## Réponses (`EmailReply`, `Lead`)
| Signal | Source | Limite |
|---|---|---|
| Réponse | `EmailReply` (une par envoi), `receivedAt` | Les réponses automatiques (absence) sont écartées avant enregistrement. Une réponse d'un collègue du prospect compte comme une réponse |
| Sentiment | `EmailReply.classification` ∈ POSITIVE, NEGATIVE, NEUTRAL (+ `confidence`) | **Classé par un LLM** ; en repli, par mots-clés. Le prospect peut orienter sa propre classification. La demande de rendez-vous est rangée en POSITIVE en base |
| Rendez-vous | Notification `LEAD_REPLIED_MEETING` ; `Lead.status = qualified` | Seule trace qui distingue le rendez-vous du simple intérêt ; un rendez-vous pris hors de Phantera n'est pas connu |
| Converti | `Lead.status = converted`, `wonAt` | Saisi à la main : absent ne veut pas dire « non converti » |
| Désinscription | `Lead.doNotContact` ; lead anonymisé `opposition-…@invalid.phantera` ; empreinte `OptOut` | Après une opposition, le lead est anonymisé : ses champs de ciblage ne sont plus lisibles. Les oppositions se comptent, mais ne s'analysent pas par titre ou secteur |
| STOP SMS | Événements Brevo -> `doNotContact` | Le même drapeau couvre les réponses, désinscriptions, plaintes et rebonds durs : la cause se lit à côté (réponse existante, empreinte d'opposition) |
| Délai de réponse | `EmailReply.receivedAt − EmailSend.sentAt` | Mesuré depuis l'étape répondue, pas depuis le premier contact |

## Leads et ciblage (`Lead`, `LeadEnrichment`)
| Signal | Source | Limite |
|---|---|---|
| Titre, secteur, taille, pays | `Lead.title/industry/companySize/country` | Texte libre venant d'Apollo, de CSV ou de saisies manuelles ; à normaliser avant de grouper ; vide pour les leads anonymisés |
| Score et badge | `aiScore`, `scoreBadge` (FAST_TRACK ≥ 80, NORMAL 50-79, NURTURE 25-49, SKIP < 25, UNSCORED) | Score produit par un LLM sur des champs que le prospect peut influencer. Les seuils sont ceux de `scoreToBadge` |
| Source | `Lead.source` | : |
| Qualité de l'e-mail | `LeadEnrichment.emailStatus` (valid, invalid, accept_all, unknown), `emailConfidence` | `accept_all` ne garantit pas la boîte ; vérification à une date donnée (`enrichedAt`) |

## Campagne et message (`Campaign`, `CampaignEmailStep`)
| Signal | Source | Limite |
|---|---|---|
| Statut, dates | `status`, `createdAt`, `lastProcessedAt`, `completedAt` | **Pas de date de lancement stockée** : approchée par le premier `sentAt` de la campagne |
| Compteurs dénormalisés | `sentCount`, `openCount`, `replyCount`, `convertedCount` | Ne servent qu'à l'affichage : les faits se recalculent depuis `EmailSend` et `EmailReply`. NOT_INTERESTED n'incrémente pas `replyCount` |
| Étapes | `position`, `dayOffset`, `channel`, `subject`, `body` | Le texte est un gabarit : la longueur et la personnalisation se mesurent avant le remplacement des variables |
| Expéditeur | `connectedMailboxId`, `fromAlias`, `senderLostAt` | `senderLostAt` = l'expéditeur a disparu et la campagne attend un choix |
| Ciblage voulu | `targetTitles`, `targetGeos`, `targetCompanySizes`, `targetIndustry` | La cible déclarée n'est pas la cible atteinte : on compare les deux |

## Délivrabilité (`ConnectedMailbox`)
| Signal | Source | Limite |
|---|---|---|
| État de la boîte | `status` (CONNECTED, EXPIRED, REVOKED, ERROR), `lastSyncError` | : |
| Pause du fournisseur | `sendPausedUntil` | Posée quand le fournisseur limite l'envoi |
| Plafond quotidien | `dailyCap`, `warmupEnabled`, ancienneté (`createdAt`) | L'échauffement abaisse le plafond réel des boîtes récentes |
| SPF / DKIM / DMARC | Non stockés | **Inconnus de Phantera** : diagnostic externe nécessaire |

## Autres
- **`LeadTouch`** (WhatsApp, SMS) : relances préparées et envoyées par l'utilisateur ; `sentAt` déclaratif.
- **`PhoneReveal`** : coût en crédits Apollo, pas un résultat de campagne.
- **`Notification`** : la seule trace distincte des demandes de rendez-vous.

## Conséquences pour E2
1. **Le taux de réponse** (réponses / envois aboutis) est le signal principal. Le taux d'ouverture n'est jamais la base d'une conclusion.
2. **Toute comparaison** porte sur des cohortes de même âge (J+n), la même boîte et la même période. Sinon la différence est signalée comme facteur de confusion (`compare.ts`).
3. **Les leads anonymisés** sortent des analyses de ciblage, mais restent comptés dans les volumes.

## Règles d'usage pour l'Analyste (relecture de Rebecca, 2026-10-17)
1. **Unité : le lead.** Taux de réponse = leads ayant répondu / leads contactés ; par étape, leads distincts. Un message n'est jamais une unité de comparaison : plusieurs messages vont au même lead.
2. **« Réponse » ≠ « intérêt ».** `replyRate` compte toute réponse, refus compris ; seul `positiveRate` (réponses POSITIVE) parle d'intérêt. Toute classification est faite par IA et non vérifiée : toujours la présenter comme telle.
3. **Données censurées à droite.**
   - Une campagne jeune n'a pas encore reçu toutes ses réponses ni tous ses rebonds.
   - Aucun silence n'est jugé avant 7 jours.
   - Les délais de réponse ne sont pas publiés sous 20 réponses.
   - À terme (E5), comparer à fenêtre fixe : réponses dans les 7 jours, parmi les leads contactés depuis au moins 7 jours.
4. **Facteurs de confusion obligatoires.**
   - `compareRates` exige qu'on dise ce qui diffère (boîte, période, plan, ciblage, mélange d'étapes), ou qu'on avoue ne pas l'avoir vérifié.
   - Sans cette vérification, jamais plus qu'une « tendance ».
5. **Une seule famille de tests par réponse.**
   - Tous les segments testés pour une même question passent dans un seul `compareSegments`, toutes dimensions confondues.
   - Un segment gagnant est **exploratoire** : à vérifier seul avant d'agir.
   - Risque de paradoxe de Simpson : un segment peut « gagner » parce qu'il a été envoyé depuis la meilleure boîte.
6. **« Tendance » se dit « à surveiller, non démontré ».** Jamais « probable », « meilleur » ni « plus efficace », et toujours avec l'intervalle de Newcombe de l'écart.
7. **Segments.**
   - Titres et secteurs sont du texte libre, normalisé seulement en casse et en espaces : « CEO », « DG » et « Directeur général » restent séparés.
   - « (non renseigné) » n'est pas un segment comparable.
   - Seuls les 15 plus gros segments sont listés : le reste se calcule depuis les totaux, jamais depuis la liste.
   - Les leads anonymisés (opposition) sortent des segments mais restent dans les totaux (`leads.anonymised`).
8. **Rythme.** `rhythm` décrit quand Phantera a envoyé (heure de Paris), pas quand cela a marché : aucune conclusion du type « envoyez à 9 h ».
9. **Âge d'une campagne.**
   - Il est approché par le premier envoi.
   - Une campagne retenue par un quota puis envoyée paraît plus âgée qu'elle n'est.
   - Une campagne envoyée par vagues expose ses leads inégalement.
