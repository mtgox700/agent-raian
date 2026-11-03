/**
 * Shapes of the campaign screens (list, wizard, detail), derived from the
 * contract (@phantera/sdk), never re-declared by hand.
 */
import type { CallInput, CallOutput } from '@phantera/sdk'

type CampaignsView = CallOutput<'views.campaigns'>
export type CampaignListItem = CampaignsView['campaigns'][number]
export type CampaignListStatus = CampaignListItem['status']

type CampaignView = Exclude<CallOutput<'views.campaign'>, { redirectTo: string }>
export type CampaignDetailData = CampaignView['campaign']
export type CampaignStepStats = CampaignView['stepStats'][number]
export type CampaignLeadRow = CampaignView['leads'][number]
export type CampaignLeadCounts = CampaignView['leadCounts']
export type WorkspacePlan = CampaignView['plan']

export type StepChannelKey = CampaignStepStats['channel']
export type SendStatusData = CallOutput<'campaigns.sendStatus'>
export type SendHoldKey = NonNullable<SendStatusData['hold']>
export type LaunchResultData = CallOutput<'campaigns.launch'>['data']
export type SendEstimateData = NonNullable<LaunchResultData['estimate']>
export type SenderState = CallOutput<'campaigns.getSender'>

export type LeadSearchParams = CallInput<'leads.searchStream'>['body']
export type AvailableLeadRow = CallOutput<'leads.available'>['data']['leads'][number]
export type SentTouchRow = CallOutput<'leads.listTouches'>['touches'][number]
export type TouchChannelKey = CallInput<'leads.draftTouch'>['body']['channel']
export type PhoneRevealState = CallOutput<'leads.phoneRevealState'>

export type IcpSuggestionData = CallOutput<'ai.analyzeProduct'>['suggestion']
export type ExpressSetupData = CallOutput<'ai.campaignFromUrl'>['setup']
