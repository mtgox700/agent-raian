'use client'

/**
 * « Prospecter avec IA » from the campaign page: the leads.searchStream input,
 * pre-filled from the campaign's targeting, with the filters of the plan
 * (locked sections offer the upgrade). Same fields and payload as body n°1.
 */
import { useState } from 'react'
import { Briefcase, Building2, ChevronRight, Loader2, Lock, Plus, Rocket, Search, Sparkles, TrendingUp, X, Zap } from 'lucide-react'
import { Button, Select } from '@/components/ui'
import { Drawer } from '@/components/dashboard/campaign/Drawer'
import { leadSearchCopy as t } from '@/lib/copy/campaign'
import type { LeadSearchParams, WorkspacePlan } from '@/lib/front/types-campaigns'
import { PLAN_CONFIG } from '@/lib/stripe/plans'
import { GEOS, INDUSTRIES, JOB_TITLES } from '@/lib/types/campaign-wizard'
import { EMAIL_STATUS_OPTIONS, FUNDING_ROUND_OPTIONS, JOB_FUNCTION_OPTIONS, SENIORITY_OPTIONS, getMinPlanForFilter, isFilterAllowed, type FilterKey } from '@/lib/types/search-filters'
import { cn } from '@/lib/utils'

type CompanySize = 'XS' | 'S' | 'M' | 'L' | 'XL'
const LEAD_COUNTS = [10, 25, 50, 100]
const planName = (plan: WorkspacePlan) => (plan === 'FREE' ? t.freePlan : PLAN_CONFIG[plan].name)

const FIELD_LABEL = 'mb-2 block font-mono text-xs text-quiet'
const SUB_LABEL = 'mb-2 block font-mono text-[11px] text-quiet'
const TEXT_INPUT = 'h-8 w-full rounded-md border border-line bg-canvas px-3 text-xs text-ink placeholder:text-quiet outline-none focus:border-accent/40'
const CHIP = 'rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors duration-200 ease-signal'
const CHIP_ON = 'border-accent/30 bg-accent/10 text-accent'
const CHIP_OFF = 'border-line bg-canvas text-quiet hover:text-ink'

function ChipGroup<T extends string>({ options, selected, onToggle, label }: {
  options: readonly { value: T; label: string }[]; selected: readonly string[]; onToggle: (v: T) => void; label: string
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
      {options.map(({ value, label: optionLabel }) => {
        const on = selected.includes(value)
        return <button key={value} type="button" onClick={() => onToggle(value)} aria-pressed={on} className={cn(CHIP, on ? CHIP_ON : CHIP_OFF)}>{optionLabel}</button>
      })}
    </div>
  )
}

function MultiText({ value, onChange, placeholder, label }: { value: string[]; onChange: (v: string[]) => void; placeholder: string; label: string }) {
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
        <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          placeholder={placeholder} aria-label={label} className={cn(TEXT_INPUT, 'flex-1')} />
        <button type="button" onClick={add} aria-label={t.addTo(label)} className="flex w-8 shrink-0 items-center justify-center rounded-md border border-accent/25 text-accent transition-colors hover:bg-accent/10">
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1">
          {value.map((v) => (
            <li key={v} className="flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[11px] text-ink/80">
              {v}
              <button type="button" onClick={() => onChange(value.filter((x) => x !== v))} aria-label={t.remove(v)} className="text-quiet transition-colors hover:text-danger">
                <X className="h-2.5 w-2.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function FilterSection({ title, icon: Icon, defaultOpen = false, locked = false, minPlan, onUpgrade, children }: {
  title: string; icon: typeof Search; defaultOpen?: boolean; locked?: boolean; minPlan?: WorkspacePlan; onUpgrade?: () => void; children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  if (locked) {
    return (
      <div className="rounded-lg border border-line p-3">
        <button type="button" onClick={() => onUpgrade?.()} className="group flex w-full items-center justify-between gap-2 text-left">
          <span className="flex items-center gap-2">
            <Icon className="h-3.5 w-3.5 text-quiet/60" aria-hidden="true" />
            <span className="font-mono text-[11px] text-quiet">{title}</span>
          </span>
          <span className="flex items-center gap-1 rounded-full border border-signal/25 px-2 py-0.5 font-mono text-[11px] text-signal transition-colors group-hover:bg-signal/10">
            <Lock className="h-2.5 w-2.5" aria-hidden="true" />
            {minPlan ? t.offer(planName(minPlan)) : t.higherOffer}
          </span>
        </button>
      </div>
    )
  }
  return (
    <div className="rounded-lg border border-line">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between gap-2 px-3 py-2.5">
        <span className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
          <span className="font-mono text-[11px] text-ink/80">{title}</span>
        </span>
        <ChevronRight className={cn('h-3.5 w-3.5 text-quiet transition-transform duration-200 ease-signal', open && 'rotate-90')} aria-hidden="true" />
      </button>
      {open && <div className="space-y-3 border-t border-line px-3 py-3">{children}</div>}
    </div>
  )
}

export function LeadSearchDrawer({
  open, workspaceId, campaignId, plan = 'FREE', defaultTitles, defaultIndustry, defaultSizes, defaultCountry, onClose, onSearch, onUpgrade, isLoading = false,
}: {
  open: boolean
  workspaceId: string
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
  const [titles, setTitles] = useState<string[]>(() => defaultTitles ?? [])
  const [industry, setIndustry] = useState(() => defaultIndustry ?? '')
  const [sizes, setSizes] = useState<CompanySize[]>(() => defaultSizes ?? [])
  const [country, setCountry] = useState(() => defaultCountry ?? 'France')
  const [limit, setLimit] = useState(25)
  const [titleSearch, setTitleSearch] = useState('')

  const [seniorities, setSeniorities] = useState<string[]>([])
  const [jobFunctions, setJobFunctions] = useState<string[]>([])
  const [multiCountries, setMultiCountries] = useState<string[]>([])
  const [emailStatus, setEmailStatus] = useState<string[]>([])
  const [excludeDomains, setExcludeDomains] = useState<string[]>([])
  const [companyKeywords, setCompanyKeywords] = useState<string[]>([])

  const [orgLocations, setOrgLocations] = useState<string[]>([])
  const [excludeLocations, setExcludeLocations] = useState<string[]>([])
  const [fundingRounds, setFundingRounds] = useState<string[]>([])
  const [revenueMin, setRevenueMin] = useState('')
  const [revenueMax, setRevenueMax] = useState('')
  const [foundedMin, setFoundedMin] = useState('')
  const [foundedMax, setFoundedMax] = useState('')

  const [recentlyJoined, setRecentlyJoined] = useState(false)
  const [recentFunding, setRecentFunding] = useState<string[]>([])
  const [recentNews, setRecentNews] = useState(false)
  const [usingTechAny, setUsingTechAny] = useState<string[]>([])
  const [notUsingTech, setNotUsingTech] = useState<string[]>([])

  const filteredTitles = JOB_TITLES.filter((x) => x.toLowerCase().includes(titleSearch.toLowerCase()))
  const suggestions = filteredTitles.filter((x) => !titles.includes(x))
  const toggle = (list: string[], set: (v: string[]) => void, v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
  const can = (key: FilterKey) => isFilterAllowed(plan, key)
  const upgrade = (key: FilterKey) => () => onUpgrade?.(getMinPlanForFilter(key))
  const addCustomTitle = () => {
    const v = titleSearch.trim()
    if (v && !titles.includes(v)) { setTitles((p) => [...p, v]); setTitleSearch('') }
  }
  const showAdd = titleSearch.trim() !== ''
    && !JOB_TITLES.some((x) => x.toLowerCase() === titleSearch.trim().toLowerCase())
    && !titles.includes(titleSearch.trim())

  const handleSearch = () => {
    if (titles.length === 0) return
    const some = <T,>(list: T[]) => (list.length > 0 ? list : undefined)
    onSearch({
      workspaceId,
      campaignId,
      jobTitles: titles,
      industry: industry || undefined,
      companySizes: some(sizes),
      country: country || undefined,
      seniorities: some(seniorities) as LeadSearchParams['seniorities'],
      jobFunctions: some(jobFunctions) as LeadSearchParams['jobFunctions'],
      multiCountries: some(multiCountries),
      emailStatus: some(emailStatus) as LeadSearchParams['emailStatus'],
      excludeDomains: some(excludeDomains),
      companyKeywords: some(companyKeywords),
      organizationLocations: some(orgLocations),
      excludeLocations: some(excludeLocations),
      fundingRounds: some(fundingRounds) as LeadSearchParams['fundingRounds'],
      revenueMin: revenueMin ? Number(revenueMin) : undefined,
      revenueMax: revenueMax ? Number(revenueMax) : undefined,
      foundedYearMin: foundedMin ? Number(foundedMin) : undefined,
      foundedYearMax: foundedMax ? Number(foundedMax) : undefined,
      recentlyJoined: recentlyJoined || undefined,
      recentFundingRounds: some(recentFunding) as LeadSearchParams['recentFundingRounds'],
      recentNews: recentNews || undefined,
      usingTechAny: some(usingTechAny),
      notUsingTech: some(notUsingTech),
      limit,
      page: 1,
    })
  }

  const footer = (
    <div className="w-full">
      <Button size="lg" onClick={handleSearch} disabled={titles.length === 0 || isLoading} className="w-full">
        {isLoading
          ? <><Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />{t.running}</>
          : <><Sparkles className="h-4 w-4" aria-hidden="true" />{t.launch}</>}
      </Button>
      {titles.length === 0 && <p className="mt-2 text-center text-[11px] text-danger">{t.needTitle}</p>}
    </div>
  )

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size="md"
      closeLabel={t.close}
      title={<span className="flex items-center gap-2.5"><Zap className="h-4 w-4 text-accent" aria-hidden="true" />{t.title}</span>}
      description={t.description(planName(plan))}
      footer={footer}
    >
      <div className="space-y-4">
        {campaignId && (defaultTitles?.length ?? 0) > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-accent/25 px-3 py-2.5">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
            <p className="text-[11px] text-ink/80">{t.prefilled}</p>
          </div>
        )}

        <div>
          <label htmlFor="lead-search-title" className={FIELD_LABEL}>{t.titles} <span className="text-danger" aria-hidden="true">*</span></label>
          <div className="relative mb-2 flex gap-1.5">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-quiet" aria-hidden="true" />
              <input
                id="lead-search-title"
                value={titleSearch}
                onChange={(e) => setTitleSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomTitle() } }}
                placeholder={t.titlePlaceholder}
                aria-required="true"
                className={cn(TEXT_INPUT, 'pl-9')}
              />
            </div>
            {showAdd && (
              <button type="button" onClick={addCustomTitle} title={t.addCustomTitle}
                className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-accent/25 px-3 text-[11px] font-semibold text-accent transition-colors hover:bg-accent/10">
                <Plus className="h-3 w-3" aria-hidden="true" />{t.add}
              </button>
            )}
          </div>
          {titles.length > 0 && (
            <ul className="mb-2 flex flex-wrap gap-1.5 rounded-md border border-line p-2" aria-label={t.chosen}>
              {titles.map((x) => (
                <li key={x} className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent">
                  {x}
                  <button type="button" onClick={() => setTitles((p) => p.filter((y) => y !== x))} className="text-accent/70 transition-colors hover:text-danger" aria-label={t.remove(x)}>
                    <X className="h-2.5 w-2.5" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto pr-1" role="group" aria-label={t.suggestions}>
            {suggestions.slice(0, 60).map((title) => (
              <button key={title} type="button" onClick={() => toggle(titles, setTitles, title)} className={cn('inline-flex items-center gap-1', CHIP, CHIP_OFF)}>
                <Plus className="h-2.5 w-2.5" aria-hidden="true" />{title}
              </button>
            ))}
            {suggestions.length === 0 && titleSearch && <p className="text-[11px] text-quiet">{t.noSuggestion(titleSearch.trim())}</p>}
          </div>
          <p className="mt-1.5 text-[11px] text-quiet">{t.tip}</p>
        </div>

        <div>
          <label htmlFor="lead-search-industry" className={FIELD_LABEL}>{t.industry}</label>
          <Select id="lead-search-industry" size="sm" value={industry} onChange={(e) => setIndustry(e.target.value)} className="text-xs">
            <option value="">{t.allIndustries}</option>
            {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
          </Select>
        </div>

        <div>
          <p className={FIELD_LABEL}>{t.size}</p>
          <ChipGroup options={t.sizes} selected={sizes} onToggle={(v) => setSizes((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v]))} label={t.size} />
        </div>

        <div>
          <label htmlFor="lead-search-country" className={FIELD_LABEL}>{t.geo}</label>
          <Select id="lead-search-country" size="sm" value={country} onChange={(e) => setCountry(e.target.value)} className="text-xs">
            <option value="">{t.world}</option>
            {GEOS.map((g) => <option key={g} value={g}>{g}</option>)}
          </Select>
        </div>

        <FilterSection title={t.personFilters} icon={Briefcase} defaultOpen={can('seniorities')} locked={!can('seniorities')} minPlan={getMinPlanForFilter('seniorities')} onUpgrade={upgrade('seniorities')}>
          <div><p className={SUB_LABEL}>{t.seniority}</p><ChipGroup options={SENIORITY_OPTIONS} selected={seniorities} onToggle={(v) => toggle(seniorities, setSeniorities, v)} label={t.seniority} /></div>
          <div><p className={SUB_LABEL}>{t.jobFunction}</p><ChipGroup options={JOB_FUNCTION_OPTIONS} selected={jobFunctions} onToggle={(v) => toggle(jobFunctions, setJobFunctions, v)} label={t.jobFunction} /></div>
          <div><p className={SUB_LABEL}>{t.emailStatus}</p><ChipGroup options={EMAIL_STATUS_OPTIONS} selected={emailStatus} onToggle={(v) => toggle(emailStatus, setEmailStatus, v)} label={t.emailStatus} /></div>
          <div><p className={SUB_LABEL}>{t.moreCountries}</p><MultiText value={multiCountries} onChange={setMultiCountries} placeholder={t.moreCountriesPh} label={t.moreCountries} /></div>
        </FilterSection>

        <FilterSection title={t.companyFilters} icon={Building2} defaultOpen={can('excludeDomains')} locked={!can('excludeDomains')} minPlan={getMinPlanForFilter('excludeDomains')} onUpgrade={upgrade('excludeDomains')}>
          <div><p className={SUB_LABEL}>{t.keywords}</p><MultiText value={companyKeywords} onChange={setCompanyKeywords} placeholder={t.keywordsPh} label={t.keywords} /></div>
          <div><p className={SUB_LABEL}>{t.excludeDomains}</p><MultiText value={excludeDomains} onChange={setExcludeDomains} placeholder={t.excludeDomainsPh} label={t.excludeDomainsLabel} /></div>
        </FilterSection>

        <FilterSection title={t.finance} icon={TrendingUp} locked={!can('fundingRounds')} minPlan={getMinPlanForFilter('fundingRounds')} onUpgrade={upgrade('fundingRounds')}>
          <div><p className={SUB_LABEL}>{t.funding}</p><ChipGroup options={FUNDING_ROUND_OPTIONS} selected={fundingRounds} onToggle={(v) => toggle(fundingRounds, setFundingRounds, v)} label={t.funding} /></div>
          <div>
            <p className={SUB_LABEL}>{t.revenue}</p>
            <div className="flex gap-2">
              <input type="number" value={revenueMin} onChange={(e) => setRevenueMin(e.target.value)} placeholder={t.min} aria-label={t.revenueMin} className={cn(TEXT_INPUT, 'flex-1 font-mono')} />
              <input type="number" value={revenueMax} onChange={(e) => setRevenueMax(e.target.value)} placeholder={t.max} aria-label={t.revenueMax} className={cn(TEXT_INPUT, 'flex-1 font-mono')} />
            </div>
          </div>
          <div>
            <p className={SUB_LABEL}>{t.founded}</p>
            <div className="flex gap-2">
              <input type="number" value={foundedMin} onChange={(e) => setFoundedMin(e.target.value)} placeholder={t.foundedMinPh} aria-label={t.foundedMin} className={cn(TEXT_INPUT, 'flex-1 font-mono')} />
              <input type="number" value={foundedMax} onChange={(e) => setFoundedMax(e.target.value)} placeholder={t.foundedMaxPh} aria-label={t.foundedMax} className={cn(TEXT_INPUT, 'flex-1 font-mono')} />
            </div>
          </div>
          <div><p className={SUB_LABEL}>{t.hq}</p><MultiText value={orgLocations} onChange={setOrgLocations} placeholder={t.hqPh} label={t.hq} /></div>
          <div><p className={SUB_LABEL}>{t.excludeCountries}</p><MultiText value={excludeLocations} onChange={setExcludeLocations} placeholder={t.excludeCountriesPh} label={t.excludeCountries} /></div>
        </FilterSection>

        <FilterSection title={t.intent} icon={Rocket} locked={!can('recentlyJoined')} minPlan={getMinPlanForFilter('recentlyJoined')} onUpgrade={upgrade('recentlyJoined')}>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={recentlyJoined} onChange={(e) => setRecentlyJoined(e.target.checked)} className="accent-[rgb(var(--c-cyan))]" />
            <span className="text-xs text-ink/80">{t.recentlyJoined}</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={recentNews} onChange={(e) => setRecentNews(e.target.checked)} className="accent-[rgb(var(--c-cyan))]" />
            <span className="text-xs text-ink/80">{t.recentNews}</span>
          </label>
          <div><p className={SUB_LABEL}>{t.recentFunding}</p><ChipGroup options={FUNDING_ROUND_OPTIONS} selected={recentFunding} onToggle={(v) => toggle(recentFunding, setRecentFunding, v)} label={t.recentFunding} /></div>
          <div><p className={SUB_LABEL}>{t.usingTech}</p><MultiText value={usingTechAny} onChange={setUsingTechAny} placeholder={t.usingTechPh} label={t.usingTech} /></div>
          <div><p className={SUB_LABEL}>{t.notUsingTech}</p><MultiText value={notUsingTech} onChange={setNotUsingTech} placeholder={t.notUsingTechPh} label={t.notUsingTechLabel} /></div>
        </FilterSection>

        <div>
          <p className={FIELD_LABEL}>{t.count}</p>
          <div className="flex gap-2" role="group" aria-label={t.count}>
            {LEAD_COUNTS.map((n) => (
              <button key={n} type="button" onClick={() => setLimit(n)} aria-pressed={limit === n}
                className={cn('flex-1 rounded-md border py-2 font-mono text-xs font-bold tabular-nums transition-colors duration-200 ease-signal', limit === n ? CHIP_ON : CHIP_OFF)}>
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
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-accent/25 font-mono text-[11px] font-bold text-accent">{step}</span>
                <p className="text-[11px]"><span className="font-semibold text-ink/80">{label}</span><span className="text-quiet"> : {desc}</span></p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Drawer>
  )
}
