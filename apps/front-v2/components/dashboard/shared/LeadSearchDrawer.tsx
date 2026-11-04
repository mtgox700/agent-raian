'use client'

/**
 * « Prospecter avec IA »: the targeting of a sourcing run (job titles,
 * industry, size, geography, then the filters each offer unlocks). Locked
 * filters say which offer opens them and lead to the upgrade dialog.
 * From the Leads screen it starts empty; from a campaign page it is
 * pre-filled with the campaign's targeting and the run is tied to it
 * (`campaignId`), as body n°1's single drawer did.
 */

import { useState } from 'react'
import { Briefcase, Building2, ChevronRight, Loader2, Lock, Plus, Rocket, Search, Sparkles, TrendingUp, X, Zap } from 'lucide-react'
import { Button, Input, Select } from '@/components/ui'
import { cn } from '@/lib/utils'
import { GEOS, INDUSTRIES, JOB_TITLES } from '@/lib/types/campaign-wizard'
import {
  EMAIL_STATUS_OPTIONS, FUNDING_ROUND_OPTIONS, JOB_FUNCTION_OPTIONS, SENIORITY_OPTIONS, getMinPlanForFilter, isFilterAllowed, type FilterKey,
} from '@/lib/types/search-filters'
import { searchCopy as t } from '@/lib/copy/leads'
import type { CompanySize, LeadSearchParams, WorkspacePlan } from '@/lib/front/types-leads'
import { Drawer } from './Drawer'

const FIELD_LABEL = 'mb-2 block font-mono text-xs text-quiet'
const SUB_LABEL = 'mb-2 block font-mono text-[11px] text-quiet'
const CHIP = 'rounded-full border px-2.5 py-1 text-xs transition-colors duration-200 ease-signal'
const CHIP_ON = 'border-accent/50 bg-surface text-accent'
const CHIP_OFF = 'border-line text-quiet hover:text-ink'

function ChipGroup<T extends string>({ options, selected, onToggle, label }: {
  options: readonly { value: T; label: string }[]
  selected: readonly string[]
  onToggle: (v: T) => void
  label: string
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
      {options.map(({ value, label: optionLabel }) => {
        const isOn = selected.includes(value)
        return (
          <button key={value} type="button" onClick={() => onToggle(value)} aria-pressed={isOn} className={cn(CHIP, isOn ? CHIP_ON : CHIP_OFF)}>
            {optionLabel}
          </button>
        )
      })}
    </div>
  )
}

/** Free text turned into chips (Enter or +). */
function MultiText({ value, onChange, placeholder, label }: {
  value: string[]
  onChange: (v: string[]) => void
  placeholder: string
  label: string
}) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const v = draft.trim()
    if (!v) return
    if (!value.includes(v)) onChange([...value, v])
    setDraft('')
  }
  return (
    <div className="space-y-1.5">
      <div className="flex gap-1.5">
        <Input
          size="sm"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          placeholder={placeholder}
          aria-label={label}
          className="flex-1"
        />
        <button
          type="button"
          onClick={add}
          aria-label={t.addTo(label)}
          className="flex w-9 shrink-0 items-center justify-center rounded-md border border-line text-accent transition-colors duration-200 ease-signal hover:border-accent"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1">
          {value.map((v) => (
            <li key={v} className="flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-xs text-ink">
              {v}
              <button type="button" onClick={() => onChange(value.filter((x) => x !== v))} aria-label={t.remove(v)} className="text-quiet transition-colors duration-200 ease-signal hover:text-danger">
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** A collapsible group of filters; locked, it names the offer that opens it. */
function FilterSection({ title, icon: Icon, defaultOpen = false, locked = false, minPlan, onUpgrade, children }: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  defaultOpen?: boolean
  locked?: boolean
  minPlan?: string
  onUpgrade?: () => void
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  if (locked) {
    return (
      <div className="rounded-lg border border-line p-3">
        <button type="button" onClick={() => onUpgrade?.()} className="group flex w-full items-center justify-between gap-2 text-left">
          <span className="flex items-center gap-2">
            <Icon className="h-3.5 w-3.5 text-quiet/60" />
            <span className="font-mono text-[11px] text-quiet">{title}</span>
          </span>
          <span className="flex items-center gap-1 rounded-full border border-signal/40 px-2 py-0.5 font-mono text-[11px] text-signal transition-colors duration-200 ease-signal group-hover:bg-surface">
            <Lock className="h-2.5 w-2.5" aria-hidden="true" />
            {t.locked(minPlan ?? null)}
          </span>
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-line">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between gap-2 px-3 py-2.5">
        <span className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5 text-accent" />
          <span className="font-mono text-[11px] text-ink">{title}</span>
        </span>
        <ChevronRight className={cn('h-3.5 w-3.5 text-quiet transition-transform duration-200 ease-signal', open && 'rotate-90')} aria-hidden="true" />
      </button>
      {open && <div className="space-y-3 border-t border-line px-3 py-3">{children}</div>}
    </div>
  )
}

type Seniority = NonNullable<LeadSearchParams['seniorities']>[number]
type JobFunction = NonNullable<LeadSearchParams['jobFunctions']>[number]
type EmailStatus = NonNullable<LeadSearchParams['emailStatus']>[number]
type FundingRound = NonNullable<LeadSearchParams['fundingRounds']>[number]

const toggle = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
const orUndefined = <T,>(list: T[]): T[] | undefined => (list.length > 0 ? list : undefined)

export function LeadSearchDrawer({
  open, workspaceId, campaignId, plan = 'FREE', defaultTitles, defaultIndustry, defaultSizes, defaultCountry,
  onClose, onSearch, onUpgrade, isLoading = false,
}: {
  open: boolean
  workspaceId: string
  /** The campaign the found leads join (campaign page only). */
  campaignId?: string
  plan?: WorkspacePlan
  defaultTitles?: string[]
  defaultIndustry?: string
  defaultSizes?: CompanySize[]
  defaultCountry?: string
  onClose: () => void
  onSearch: (params: LeadSearchParams) => void
  onUpgrade?: (minPlan: WorkspacePlan) => void
  isLoading?: boolean
}) {
  // Basic
  const [selectedTitles, setSelectedTitles] = useState<string[]>(() => defaultTitles ?? [])
  const [industry, setIndustry] = useState(() => defaultIndustry ?? '')
  const [selectedSizes, setSelectedSizes] = useState<CompanySize[]>(() => defaultSizes ?? [])
  const [country, setCountry] = useState(() => defaultCountry ?? 'France')
  const [limit, setLimit] = useState(25)
  const [titleSearch, setTitleSearch] = useState('')
  // Advanced (Pro)
  const [seniorities, setSeniorities] = useState<Seniority[]>([])
  const [jobFunctions, setJobFunctions] = useState<JobFunction[]>([])
  const [multiCountries, setMultiCountries] = useState<string[]>([])
  const [emailStatus, setEmailStatus] = useState<EmailStatus[]>([])
  const [excludeDomains, setExcludeDomains] = useState<string[]>([])
  const [companyKeywords, setCompanyKeywords] = useState<string[]>([])
  // Expert (Business)
  const [orgLocations, setOrgLocations] = useState<string[]>([])
  const [excludeLocations, setExcludeLocations] = useState<string[]>([])
  const [fundingRounds, setFundingRounds] = useState<FundingRound[]>([])
  const [revenueMin, setRevenueMin] = useState('')
  const [revenueMax, setRevenueMax] = useState('')
  const [foundedMin, setFoundedMin] = useState('')
  const [foundedMax, setFoundedMax] = useState('')
  // Max (Enterprise)
  const [recentlyJoined, setRecentlyJoined] = useState(false)
  const [recentFunding, setRecentFunding] = useState<FundingRound[]>([])
  const [recentNews, setRecentNews] = useState(false)
  const [usingTechAny, setUsingTechAny] = useState<string[]>([])
  const [notUsingTech, setNotUsingTech] = useState<string[]>([])

  const filteredTitles = JOB_TITLES.filter((title) => title.toLowerCase().includes(titleSearch.toLowerCase()))
  const suggestions = filteredTitles.filter((title) => !selectedTitles.includes(title))
  const custom = titleSearch.trim()
  const can = (key: FilterKey) => isFilterAllowed(plan, key)
  const upgrade = (key: FilterKey) => () => onUpgrade?.(getMinPlanForFilter(key))
  const addCustom = () => {
    if (custom && !selectedTitles.includes(custom)) {
      setSelectedTitles((p) => [...p, custom])
      setTitleSearch('')
    }
  }

  const handleSearch = () => {
    if (selectedTitles.length === 0) return
    onSearch({
      workspaceId,
      campaignId,
      jobTitles: selectedTitles,
      industry: industry || undefined,
      companySizes: orUndefined(selectedSizes),
      country: country || undefined,
      seniorities: orUndefined(seniorities),
      jobFunctions: orUndefined(jobFunctions),
      multiCountries: orUndefined(multiCountries),
      emailStatus: orUndefined(emailStatus),
      excludeDomains: orUndefined(excludeDomains),
      companyKeywords: orUndefined(companyKeywords),
      organizationLocations: orUndefined(orgLocations),
      excludeLocations: orUndefined(excludeLocations),
      fundingRounds: orUndefined(fundingRounds),
      revenueMin: revenueMin ? Number(revenueMin) : undefined,
      revenueMax: revenueMax ? Number(revenueMax) : undefined,
      foundedYearMin: foundedMin ? Number(foundedMin) : undefined,
      foundedYearMax: foundedMax ? Number(foundedMax) : undefined,
      recentlyJoined: recentlyJoined || undefined,
      recentFundingRounds: orUndefined(recentFunding),
      recentNews: recentNews || undefined,
      usingTechAny: orUndefined(usingTechAny),
      notUsingTech: orUndefined(notUsingTech),
      limit,
      page: 1,
    })
  }

  const footer = (
    <div className="w-full">
      <Button size="lg" onClick={handleSearch} disabled={selectedTitles.length === 0 || isLoading} className="w-full">
        {isLoading
          ? <><Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />{t.launching}</>
          : <><Sparkles className="h-4 w-4" aria-hidden="true" />{t.launch}</>}
      </Button>
      {selectedTitles.length === 0 && <p className="mt-2 text-center text-xs text-danger">{t.needTitle}</p>}
    </div>
  )

  return (
    <Drawer
      open={open}
      onClose={onClose}
      closeLabel={t.close}
      title={<span className="flex items-center gap-2.5"><Zap className="h-4 w-4 text-accent" aria-hidden="true" />{t.title}</span>}
      description={t.description(plan)}
      footer={footer}
    >
      <div className="space-y-5">
        {campaignId && (defaultTitles?.length ?? 0) > 0 && (
          <p className="flex items-start gap-2 rounded-md border border-line px-3 py-2.5 text-xs text-ink">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
            {t.campaignBanner}
          </p>
        )}

        {/* Job titles (required) */}
        <div>
          <label htmlFor="lead-search-title" className={FIELD_LABEL}>
            {t.titles} <span className="text-danger" aria-hidden="true">*</span>
          </label>
          <div className="mb-2 flex gap-1.5">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-quiet" aria-hidden="true" />
              <Input
                id="lead-search-title"
                size="sm"
                value={titleSearch}
                onChange={(e) => setTitleSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom() } }}
                placeholder={t.titlesPlaceholder}
                aria-required="true"
                className="pl-9"
              />
            </div>
            {custom && !JOB_TITLES.some((title) => title.toLowerCase() === custom.toLowerCase()) && !selectedTitles.includes(custom) && (
              <button
                type="button"
                onClick={addCustom}
                title={t.addCustomTitle}
                className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-line px-3 text-xs text-accent transition-colors duration-200 ease-signal hover:border-accent"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                {t.addCustom}
              </button>
            )}
          </div>

          {selectedTitles.length > 0 && (
            <ul className="mb-2 flex flex-wrap gap-1.5 rounded-md border border-line p-2" aria-label={t.chosenTitles}>
              {selectedTitles.map((title) => (
                <li key={title} className="inline-flex items-center gap-1 rounded-full border border-accent/50 bg-surface px-2 py-0.5 text-xs text-accent">
                  {title}
                  <button
                    type="button"
                    onClick={() => setSelectedTitles((p) => p.filter((x) => x !== title))}
                    aria-label={t.remove(title)}
                    className="text-accent/70 transition-colors duration-200 ease-signal hover:text-danger"
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto pr-1" role="group" aria-label={t.suggestions}>
            {suggestions.slice(0, 60).map((title) => (
              <button
                key={title}
                type="button"
                onClick={() => setSelectedTitles((p) => toggle(p, title))}
                className={cn('inline-flex items-center gap-1', CHIP, CHIP_OFF)}
              >
                <Plus className="h-3 w-3" aria-hidden="true" />
                {title}
              </button>
            ))}
            {suggestions.length === 0 && titleSearch && <p className="text-xs text-quiet">{t.noSuggestion(custom)}</p>}
          </div>
          <p className="mt-1.5 text-xs text-quiet">{t.tip}</p>
        </div>

        <div>
          <label htmlFor="lead-search-industry" className={FIELD_LABEL}>{t.industry}</label>
          <Select id="lead-search-industry" size="sm" value={industry} onChange={(e) => setIndustry(e.target.value)}>
            <option value="">{t.allIndustries}</option>
            {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
          </Select>
        </div>

        <div>
          <p className={FIELD_LABEL}>{t.companySize}</p>
          <ChipGroup options={t.sizes} selected={selectedSizes} onToggle={(v) => setSelectedSizes((p) => toggle(p, v))} label={t.companySize} />
        </div>

        <div>
          <label htmlFor="lead-search-country" className={FIELD_LABEL}>{t.geography}</label>
          <Select id="lead-search-country" size="sm" value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="">{t.world}</option>
            {GEOS.map((g) => <option key={g} value={g}>{g}</option>)}
          </Select>
        </div>

        <FilterSection
          title={t.people.title}
          icon={Briefcase}
          defaultOpen={can('seniorities')}
          locked={!can('seniorities')}
          minPlan={getMinPlanForFilter('seniorities')}
          onUpgrade={upgrade('seniorities')}
        >
          <div>
            <p className={SUB_LABEL}>{t.people.seniority}</p>
            <ChipGroup options={SENIORITY_OPTIONS} selected={seniorities} onToggle={(v) => setSeniorities((p) => toggle(p, v))} label={t.people.seniority} />
          </div>
          <div>
            <p className={SUB_LABEL}>{t.people.jobFunction}</p>
            <ChipGroup options={JOB_FUNCTION_OPTIONS} selected={jobFunctions} onToggle={(v) => setJobFunctions((p) => toggle(p, v))} label={t.people.jobFunction} />
          </div>
          <div>
            <p className={SUB_LABEL}>{t.people.emailStatus}</p>
            <ChipGroup options={EMAIL_STATUS_OPTIONS} selected={emailStatus} onToggle={(v) => setEmailStatus((p) => toggle(p, v))} label={t.people.emailStatus} />
          </div>
          <div>
            <p className={SUB_LABEL}>{t.people.countries}</p>
            <MultiText value={multiCountries} onChange={setMultiCountries} placeholder={t.people.countriesPlaceholder} label={t.people.countries} />
          </div>
        </FilterSection>

        <FilterSection
          title={t.company.title}
          icon={Building2}
          defaultOpen={can('excludeDomains')}
          locked={!can('excludeDomains')}
          minPlan={getMinPlanForFilter('excludeDomains')}
          onUpgrade={upgrade('excludeDomains')}
        >
          <div>
            <p className={SUB_LABEL}>{t.company.keywords}</p>
            <MultiText value={companyKeywords} onChange={setCompanyKeywords} placeholder={t.company.keywordsPlaceholder} label={t.company.keywords} />
          </div>
          <div>
            <p className={SUB_LABEL}>{t.company.exclude}</p>
            <MultiText value={excludeDomains} onChange={setExcludeDomains} placeholder={t.company.excludePlaceholder} label={t.company.excludeLabel} />
          </div>
        </FilterSection>

        <FilterSection
          title={t.finance.title}
          icon={TrendingUp}
          locked={!can('fundingRounds')}
          minPlan={getMinPlanForFilter('fundingRounds')}
          onUpgrade={upgrade('fundingRounds')}
        >
          <div>
            <p className={SUB_LABEL}>{t.finance.funding}</p>
            <ChipGroup options={FUNDING_ROUND_OPTIONS} selected={fundingRounds} onToggle={(v) => setFundingRounds((p) => toggle(p, v))} label={t.finance.funding} />
          </div>
          <div>
            <p className={SUB_LABEL}>{t.finance.revenue}</p>
            <div className="flex gap-2">
              <Input size="sm" type="number" value={revenueMin} onChange={(e) => setRevenueMin(e.target.value)} placeholder={t.finance.min} aria-label={t.finance.revenueMin} className="flex-1 font-mono" />
              <Input size="sm" type="number" value={revenueMax} onChange={(e) => setRevenueMax(e.target.value)} placeholder={t.finance.max} aria-label={t.finance.revenueMax} className="flex-1 font-mono" />
            </div>
          </div>
          <div>
            <p className={SUB_LABEL}>{t.finance.founded}</p>
            <div className="flex gap-2">
              <Input size="sm" type="number" value={foundedMin} onChange={(e) => setFoundedMin(e.target.value)} placeholder={t.finance.foundedMinPlaceholder} aria-label={t.finance.foundedMin} className="flex-1 font-mono" />
              <Input size="sm" type="number" value={foundedMax} onChange={(e) => setFoundedMax(e.target.value)} placeholder={t.finance.foundedMaxPlaceholder} aria-label={t.finance.foundedMax} className="flex-1 font-mono" />
            </div>
          </div>
          <div>
            <p className={SUB_LABEL}>{t.finance.hq}</p>
            <MultiText value={orgLocations} onChange={setOrgLocations} placeholder={t.finance.hqPlaceholder} label={t.finance.hq} />
          </div>
          <div>
            <p className={SUB_LABEL}>{t.finance.excludeCountries}</p>
            <MultiText value={excludeLocations} onChange={setExcludeLocations} placeholder={t.finance.excludeCountriesPlaceholder} label={t.finance.excludeCountries} />
          </div>
        </FilterSection>

        <FilterSection
          title={t.intent.title}
          icon={Rocket}
          locked={!can('recentlyJoined')}
          minPlan={getMinPlanForFilter('recentlyJoined')}
          onUpgrade={upgrade('recentlyJoined')}
        >
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={recentlyJoined} onChange={(e) => setRecentlyJoined(e.target.checked)} className="h-4 w-4 accent-accent" />
            <span className="text-sm text-ink">{t.intent.recentlyJoined}</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={recentNews} onChange={(e) => setRecentNews(e.target.checked)} className="h-4 w-4 accent-accent" />
            <span className="text-sm text-ink">{t.intent.recentNews}</span>
          </label>
          <div>
            <p className={SUB_LABEL}>{t.intent.recentFunding}</p>
            <ChipGroup options={FUNDING_ROUND_OPTIONS} selected={recentFunding} onToggle={(v) => setRecentFunding((p) => toggle(p, v))} label={t.intent.recentFunding} />
          </div>
          <div>
            <p className={SUB_LABEL}>{t.intent.usingTech}</p>
            <MultiText value={usingTechAny} onChange={setUsingTechAny} placeholder={t.intent.usingTechPlaceholder} label={t.intent.usingTech} />
          </div>
          <div>
            <p className={SUB_LABEL}>{t.intent.notUsingTech}</p>
            <MultiText value={notUsingTech} onChange={setNotUsingTech} placeholder={t.intent.notUsingTechPlaceholder} label={t.intent.notUsingTechLabel} />
          </div>
        </FilterSection>

        <div>
          <p className={FIELD_LABEL}>{t.leadCount}</p>
          <div className="flex gap-2" role="group" aria-label={t.leadCount}>
            {t.counts.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setLimit(n)}
                aria-pressed={limit === n}
                className={cn('h-9 flex-1 rounded-md border font-mono text-sm tabular-nums transition-colors duration-200 ease-signal', limit === n ? CHIP_ON : CHIP_OFF)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-line p-4">
          <p className="mb-2 font-mono text-xs text-quiet">{t.whatItDoes}</p>
          <ol className="space-y-1.5">
            {t.steps.map(({ step, label, desc }) => (
              <li key={step} className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-accent/40 font-mono text-[11px] text-accent">{step}</span>
                <p className="text-xs">
                  <span className="font-medium text-ink">{label}</span>
                  <span className="text-quiet"> : {desc}</span>
                </p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Drawer>
  )
}
