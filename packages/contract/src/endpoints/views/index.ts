/** View endpoints: the data of one front page each, so pages never read the database. */

import { aEnvoyerViewEndpoints } from './a-envoyer'
import { analyticsViewEndpoints } from './analytics'
import { campaignViewEndpoints } from './campaign'
import { campaignsViewEndpoints } from './campaigns'
import { dashboardShellViewEndpoints } from './dashboard-shell'
import { dashboardViewEndpoints } from './dashboard'
import { historyViewEndpoints } from './history'
import { hotLeadsViewEndpoints } from './hotLeads'
import { inboxViewEndpoints } from './inbox'
import { inviteViewEndpoints } from './invite'
import { leadsViewEndpoints } from './leads'
import { onboardingViewEndpoints } from './onboarding'
import { settingsViewEndpoints } from './settings'

export const viewsEndpoints = [
  ...aEnvoyerViewEndpoints,
  ...analyticsViewEndpoints,
  ...campaignViewEndpoints,
  ...campaignsViewEndpoints,
  ...dashboardShellViewEndpoints,
  ...dashboardViewEndpoints,
  ...historyViewEndpoints,
  ...hotLeadsViewEndpoints,
  ...inboxViewEndpoints,
  ...inviteViewEndpoints,
  ...leadsViewEndpoints,
  ...onboardingViewEndpoints,
  ...settingsViewEndpoints,
]
