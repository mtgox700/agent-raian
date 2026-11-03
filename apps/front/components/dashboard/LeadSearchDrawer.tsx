'use client'

import { useState } from 'react'
import { X, Search, Zap, ChevronDown, ChevronRight, Lock, Sparkles, TrendingUp, Building2, Briefcase, Rocket, Plus, Loader2 } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { JOB_TITLES, INDUSTRIES, GEOS } from '@/lib/types/campaign-wizard'
import { isFilterAllowed, getMinPlanForFilter, SENIORITY_OPTIONS, JOB_FUNCTION_OPTIONS, EMAIL_STATUS_OPTIONS, FUNDING_ROUND_OPTIONS } from '@/lib/types/search-filters'
import { PLAN_CONFIG } from '@/lib/stripe/plans'
import type { Plan } from '@prisma/client'
import type { ApolloSearchParams, CompanySize } from '@/lib/types/lead'

// ─── Local UI types ───────────────────────────────────────────────────────────

const COMPANY_SIZES: { value: CompanySize; label: string }[] = [
  { value: 'XS', label: '1-10 emp.' },
  { value: 'S',  label: '11-50 emp.' },
  { value: 'M',  label: '51-200 emp.' },
  { value: 'L',  label: '201-1000 emp.' },
  { value: 'XL', label: '1000+ emp.' },
]

const LEAD_COUNTS = [10, 25, 50, 100]

/** The plan as the pricing page names it (PLAN_CONFIG, single source). */
const planName = (plan: Plan) => (plan === 'FREE' ? 'gratuite' : PLAN_CONFIG[plan].name)

const FIELD_LABEL = 'mb-2 block font-mono text-xs text-muted'
const SUB_LABEL = 'mb-2 block font-mono text-[11px] text-muted'
const TEXT_INPUT = 'h-8 w-full rounded-md border border-border bg-white/[0.03] px-3 text-xs text-white placeholder:text-muted outline-none focus:border-cyan/40'
const SELECT = 'h-9 w-full appearance-none rounded-md border border-border bg-white/[0.03] px-3 pr-8 text-xs text-white outline-none focus:border-cyan/40'
const CHIP = 'rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors duration-150 ease-signal'
const CHIP_ON = 'border-cyan/30 bg-cyan/10 text-cyan'
const CHIP_OFF = 'border-border bg-white/[0.03] text-muted hover:text-white'

interface LeadSearchDrawerProps {
  open:            boolean
  workspaceId:     string
  campaignId?:     string
  plan?:           Plan
  /** Pre-fill search form from campaign targeting (Step2) */
  defaultTitles?:  string[]
  defaultIndustry?: string
  defaultSizes?:   CompanySize[]
  defaultCountry?: string
  onClose:         () => void
  onSearch:        (params: ApolloSearchParams) => void
  onUpgrade?:      (minPlan: Plan) => void
  isLoading?:      boolean
}

// ─── Reusable chip group ──────────────────────────────────────────────────────

interface ChipGroupProps<T extends string> {
  options:   readonly { value: T; label: string }[]
  selected:  T[]
  onToggle:  (v: T) => void
  label:     string
}

// One "on" state for every group: the colour used to change per group
// (violet for seniority) and carried no meaning.
function ChipGroup<T extends string>({ options, selected, onToggle, label }: ChipGroupProps<T>) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
      {options.map(({ value, label: optionLabel }) => {
        const isOn = selected.includes(value)
        return (
          <button
            key={value}
            onClick={() => onToggle(value)}
            type="button"
            aria-pressed={isOn}
            className={`${CHIP} ${isOn ? CHIP_ON : CHIP_OFF}`}
          >
            {optionLabel}
          </button>
        )
      })}
    </div>
  )
}

// ─── Reusable multi-input (chip from free text) ───────────────────────────────

interface MultiTextProps {
  value:       string[]
  onChange:    (v: string[]) => void
  placeholder: string
  label:       string
}

function MultiText({ value, onChange, placeholder, label }: MultiTextProps) {
  const [draft, setDraft] = useState('')

  const add = () => {
    const v = draft.trim()
    if (!v) return
    if (value.includes(v)) { setDraft(''); return }
    onChange([...value, v])
    setDraft('')
  }

  return (
    <div className="space-y-1.5">
      <div className="flex gap-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          placeholder={placeholder}
          aria-label={label}
          className={`${TEXT_INPUT} flex-1`}
        />
        <button
          type="button"
          onClick={add}
          aria-label={`Ajouter à : ${label}`}
          className="flex w-8 flex-shrink-0 items-center justify-center rounded-md border border-cyan/25 text-cyan transition-colors hover:bg-cyan/10"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1">
          {value.map((v) => (
            <li key={v} className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-white/80">
              {v}
              <button
                type="button"
                onClick={() => onChange(value.filter((x) => x !== v))}
                aria-label={`Retirer ${v}`}
                className="text-muted transition-colors hover:text-danger"
              >
                <X className="h-2.5 w-2.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── Section wrapper with collapse + lock state ───────────────────────────────

interface SectionProps {
  title:    string
  icon:     React.ComponentType<{ className?: string }>
  defaultOpen?: boolean
  locked?:  boolean
  minPlan?: Plan
  onUpgrade?: () => void
  children: React.ReactNode
}

function Section({ title, icon: Icon, defaultOpen = false, locked = false, minPlan, onUpgrade, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  if (locked) {
    return (
      <div className="rounded-[10px] border border-border p-3">
        <button
          type="button"
          onClick={() => onUpgrade?.()}
          className="group flex w-full items-center justify-between gap-2 text-left"
        >
          <div className="flex items-center gap-2">
            <Icon className="h-3.5 w-3.5 text-muted/60" />
            <span className="font-mono text-[11px] text-muted">{title}</span>
          </div>
          <span className="flex items-center gap-1 rounded-full border border-gold/25 px-2 py-0.5 font-mono text-[11px] text-gold transition-colors group-hover:bg-gold/10">
            <Lock className="h-2.5 w-2.5" aria-hidden="true" />
            {minPlan ? `Offre ${planName(minPlan)}` : 'Offre supérieure'}
          </span>
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-[10px] border border-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5"
      >
        <div className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5 text-cyan" />
          <span className="font-mono text-[11px] text-white/80">{title}</span>
        </div>
        <ChevronRight className={`h-3.5 w-3.5 text-muted transition-transform duration-200 ease-signal ${open ? 'rotate-90' : ''}`} aria-hidden="true" />
      </button>
      {/* Opens in place, no height animation (layout cost); the chevron turns. */}
      {open && (
        <div className="space-y-3 border-t border-border px-3 py-3">
          {children}
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function LeadSearchDrawer({
  open, workspaceId, campaignId,
  plan = 'FREE',
  defaultTitles, defaultIndustry, defaultSizes, defaultCountry,
  onClose, onSearch, onUpgrade,
  isLoading = false,
}: LeadSearchDrawerProps) {
  // ── Tier 1 (basic) state ──
  const [selectedTitles, setSelectedTitles] = useState<string[]>(() => defaultTitles ?? [])
  const [industry,       setIndustry]       = useState(() => defaultIndustry ?? '')
  const [selectedSizes,  setSelectedSizes]  = useState<CompanySize[]>(() => defaultSizes ?? [])
  const [country,        setCountry]        = useState(() => defaultCountry ?? 'France')
  const [limit,          setLimit]          = useState(25)
  const [titleSearch,    setTitleSearch]    = useState('')

  // ── Tier 2 (advanced / PRO) state ──
  const [seniorities,    setSeniorities]    = useState<string[]>([])
  const [jobFunctions,   setJobFunctions]   = useState<string[]>([])
  const [multiCountries, setMultiCountries] = useState<string[]>([])
  const [emailStatus,    setEmailStatus]    = useState<string[]>([])
  const [excludeDomains, setExcludeDomains] = useState<string[]>([])
  const [companyKeywords, setCompanyKeywords] = useState<string[]>([])

  // ── Tier 3 (expert / BUSINESS) state ──
  const [orgLocations,   setOrgLocations]   = useState<string[]>([])
  const [excludeLocations, setExcludeLocations] = useState<string[]>([])
  const [fundingRounds,  setFundingRounds]  = useState<string[]>([])
  const [revenueMin,     setRevenueMin]     = useState<string>('')
  const [revenueMax,     setRevenueMax]     = useState<string>('')
  const [foundedMin,     setFoundedMin]     = useState<string>('')
  const [foundedMax,     setFoundedMax]     = useState<string>('')

  // ── Tier 4 (max / ENTERPRISE) state ──
  const [recentlyJoined, setRecentlyJoined] = useState(false)
  const [recentFunding,  setRecentFunding]  = useState<string[]>([])
  const [recentNews,     setRecentNews]     = useState(false)
  const [usingTechAny,   setUsingTechAny]   = useState<string[]>([])
  const [notUsingTech,   setNotUsingTech]   = useState<string[]>([])

  const filteredTitles = JOB_TITLES.filter((t) =>
    t.toLowerCase().includes(titleSearch.toLowerCase())
  )

  const toggleTitle = (t: string) => setSelectedTitles((p) => p.includes(t) ? p.filter((x) => x !== t) : [...p, t])
  const toggleSize  = (s: CompanySize) => setSelectedSizes((p) => p.includes(s) ? p.filter((x) => x !== s) : [...p, s])
  const toggleItem  = <T extends string>(list: T[], set: (v: T[]) => void, v: T) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  // Filter availability gates
  const can = (key: Parameters<typeof isFilterAllowed>[1]) => isFilterAllowed(plan, key)

  const handleSearch = () => {
    if (selectedTitles.length === 0) return
    onSearch({
      workspaceId,
      campaignId,
      jobTitles:    selectedTitles,
      industry:     industry || undefined,
      companySizes: selectedSizes.length > 0 ? selectedSizes : undefined,
      country:      country || undefined,

      seniorities:     seniorities.length      > 0 ? seniorities      as never : undefined,
      jobFunctions:    jobFunctions.length     > 0 ? jobFunctions     as never : undefined,
      multiCountries:  multiCountries.length   > 0 ? multiCountries   : undefined,
      emailStatus:     emailStatus.length      > 0 ? emailStatus      as never : undefined,
      excludeDomains:  excludeDomains.length   > 0 ? excludeDomains   : undefined,
      companyKeywords: companyKeywords.length  > 0 ? companyKeywords  : undefined,

      organizationLocations: orgLocations.length    > 0 ? orgLocations     : undefined,
      excludeLocations:      excludeLocations.length > 0 ? excludeLocations : undefined,
      fundingRounds:         fundingRounds.length   > 0 ? fundingRounds    as never : undefined,
      revenueMin:            revenueMin ? Number(revenueMin) : undefined,
      revenueMax:            revenueMax ? Number(revenueMax) : undefined,
      foundedYearMin:        foundedMin ? Number(foundedMin) : undefined,
      foundedYearMax:        foundedMax ? Number(foundedMax) : undefined,

      recentlyJoined:      recentlyJoined  || undefined,
      recentFundingRounds: recentFunding.length > 0 ? recentFunding as never : undefined,
      recentNews:          recentNews      || undefined,
      usingTechAny:        usingTechAny.length > 0 ? usingTechAny : undefined,
      notUsingTech:        notUsingTech.length > 0 ? notUsingTech : undefined,

      limit,
      page: 1,
    })
  }

  const handleUpgrade = (key: Parameters<typeof isFilterAllowed>[1]) => () => {
    onUpgrade?.(getMinPlanForFilter(key))
  }

  const footer = (
    <div className="w-full">
      <Button
        size="lg"
        onClick={handleSearch}
        disabled={selectedTitles.length === 0 || isLoading}
        className="w-full gap-2 text-sm"
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
            Prospection en cours...
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            Lancer la prospection
          </>
        )}
      </Button>
      {selectedTitles.length === 0 && (
        <p className="mt-2 text-center text-[11px] text-danger">Sélectionnez au moins 1 titre de poste</p>
      )}
    </div>
  )

  return (
    <Dialog
      open={open}
      onClose={onClose}
      variant="drawer"
      size="md"
      title={
        <span className="flex items-center gap-2.5">
          <Zap className="h-4 w-4 text-cyan" aria-hidden="true" />
          Prospecter avec IA
        </span>
      }
      description={`Recherche des comptes, vérification des e-mails, score · offre ${planName(plan)}`}
      footer={footer}
    >
      <div className="space-y-4">
        {/* Campaign context banner */}
        {campaignId && (defaultTitles?.length ?? 0) > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-cyan/25 px-3 py-2.5">
            <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-cyan" aria-hidden="true" />
            <p className="text-[11px] text-white/80">Ciblage pré-rempli depuis votre campagne. Modifiez si besoin.</p>
          </div>
        )}

        {/* Always visible: required job titles */}
        <div>
          <label htmlFor="lead-search-title" className={FIELD_LABEL}>
            Titres de poste <span className="text-danger" aria-hidden="true">*</span>
          </label>
          <div className="relative mb-2 flex gap-1.5">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" aria-hidden="true" />
              <input
                id="lead-search-title"
                value={titleSearch}
                onChange={(e) => setTitleSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    const v = titleSearch.trim()
                    if (v && !selectedTitles.includes(v)) {
                      setSelectedTitles((p) => [...p, v])
                      setTitleSearch('')
                    }
                  }
                }}
                placeholder="Rechercher ou taper un titre personnalisé..."
                aria-required="true"
                className={`${TEXT_INPUT} pl-9`}
              />
            </div>
            {titleSearch.trim() &&
              !JOB_TITLES.some((t) => t.toLowerCase() === titleSearch.trim().toLowerCase()) &&
              !selectedTitles.includes(titleSearch.trim()) && (
              <button
                type="button"
                onClick={() => {
                  const v = titleSearch.trim()
                  setSelectedTitles((p) => [...p, v])
                  setTitleSearch('')
                }}
                className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-cyan/25 px-3 text-[11px] font-semibold text-cyan transition-colors hover:bg-cyan/10"
                title="Ajouter ce titre personnalisé"
              >
                <Plus className="h-3 w-3" aria-hidden="true" />
                Ajouter
              </button>
            )}
          </div>

          {/* Selected titles, pinned at top so the user sees what they picked */}
          {selectedTitles.length > 0 && (
            <ul className="mb-2 flex flex-wrap gap-1.5 rounded-md border border-border p-2" aria-label="Titres choisis">
              {selectedTitles.map((t) => (
                <li
                  key={t}
                  className="inline-flex items-center gap-1 rounded-full border border-cyan/30 bg-cyan/10 px-2 py-0.5 text-[11px] font-semibold text-cyan"
                >
                  {t}
                  <button
                    type="button"
                    onClick={() => setSelectedTitles((p) => p.filter((x) => x !== t))}
                    className="text-cyan/70 transition-colors hover:text-danger"
                    aria-label={`Retirer ${t}`}
                  >
                    <X className="h-2.5 w-2.5" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Suggestions library: only those NOT already selected */}
          <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto pr-1" role="group" aria-label="Suggestions de titres">
            {filteredTitles
              .filter((t) => !selectedTitles.includes(t))
              .slice(0, 60)
              .map((title) => (
                <button
                  key={title}
                  type="button"
                  onClick={() => toggleTitle(title)}
                  className={`inline-flex items-center gap-1 ${CHIP} ${CHIP_OFF}`}
                >
                  <Plus className="h-2.5 w-2.5" aria-hidden="true" />
                  {title}
                </button>
              ))}
            {filteredTitles.filter((t) => !selectedTitles.includes(t)).length === 0 && titleSearch && (
              <p className="text-[11px] text-muted">
                Aucune suggestion : appuyez sur Entrée ou cliquez « Ajouter » pour utiliser « {titleSearch.trim()} ».
              </p>
            )}
          </div>

          <p className="mt-1.5 text-[11px] text-muted">
            Astuce : tapez n&apos;importe quel titre (français, anglais ou personnalisé) puis Entrée.
          </p>
        </div>

        {/* Industry */}
        <div>
          <label htmlFor="lead-search-industry" className={FIELD_LABEL}>Secteur d&apos;activité</label>
          <div className="relative">
            <select
              id="lead-search-industry"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              className={SELECT}
            >
              <option value="">Tous les secteurs</option>
              {INDUSTRIES.map((i) => <option key={i} value={i} className="bg-obsidian">{i}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" aria-hidden="true" />
          </div>
        </div>

        {/* Company Size */}
        <div>
          <p className={FIELD_LABEL}>Taille d&apos;entreprise</p>
          <ChipGroup options={COMPANY_SIZES} selected={selectedSizes} onToggle={toggleSize} label="Taille d'entreprise" />
        </div>

        {/* Country */}
        <div>
          <label htmlFor="lead-search-country" className={FIELD_LABEL}>Géographie</label>
          <div className="relative">
            <select
              id="lead-search-country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className={SELECT}
            >
              <option value="">Monde entier</option>
              {GEOS.map((g) => <option key={g} value={g} className="bg-obsidian">{g}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" aria-hidden="true" />
          </div>
        </div>

        {/* PRO section: advanced people filters */}
        <Section
          title="Filtres avancés Personne"
          icon={Briefcase}
          defaultOpen={can('seniorities')}
          locked={!can('seniorities')}
          minPlan={getMinPlanForFilter('seniorities')}
          onUpgrade={handleUpgrade('seniorities')}
        >
          <div>
            <p className={SUB_LABEL}>Séniorité</p>
            <ChipGroup
              options={SENIORITY_OPTIONS}
              selected={seniorities as never}
              onToggle={(v) => toggleItem(seniorities, setSeniorities, v)}
              label="Séniorité"
            />
          </div>
          <div>
            <p className={SUB_LABEL}>Fonction métier</p>
            <ChipGroup
              options={JOB_FUNCTION_OPTIONS}
              selected={jobFunctions as never}
              onToggle={(v) => toggleItem(jobFunctions, setJobFunctions, v)}
              label="Fonction métier"
            />
          </div>
          <div>
            <p className={SUB_LABEL}>Statut email</p>
            <ChipGroup
              options={EMAIL_STATUS_OPTIONS}
              selected={emailStatus as never}
              onToggle={(v) => toggleItem(emailStatus, setEmailStatus, v)}
              label="Statut email"
            />
          </div>
          <div>
            <p className={SUB_LABEL}>Pays additionnels</p>
            <MultiText value={multiCountries} onChange={setMultiCountries} placeholder="ex : Belgium, Switzerland..." label="Pays additionnels" />
          </div>
        </Section>

        {/* PRO section: company filters */}
        <Section
          title="Filtres Entreprise"
          icon={Building2}
          defaultOpen={can('excludeDomains')}
          locked={!can('excludeDomains')}
          minPlan={getMinPlanForFilter('excludeDomains')}
          onUpgrade={handleUpgrade('excludeDomains')}
        >
          <div>
            <p className={SUB_LABEL}>Mots-clés entreprise</p>
            <MultiText value={companyKeywords} onChange={setCompanyKeywords} placeholder="ex : AI, B2B, marketplace..." label="Mots-clés entreprise" />
          </div>
          <div>
            <p className={SUB_LABEL}>Exclure domaines (concurrents)</p>
            <MultiText value={excludeDomains} onChange={setExcludeDomains} placeholder="ex : lemlist.com, instantly.ai..." label="Exclure domaines" />
          </div>
        </Section>

        {/* BUSINESS section: funding, revenue, year */}
        <Section
          title="Profil financier (Business)"
          icon={TrendingUp}
          defaultOpen={false}
          locked={!can('fundingRounds')}
          minPlan={getMinPlanForFilter('fundingRounds')}
          onUpgrade={handleUpgrade('fundingRounds')}
        >
          <div>
            <p className={SUB_LABEL}>Levée de fonds</p>
            <ChipGroup
              options={FUNDING_ROUND_OPTIONS}
              selected={fundingRounds as never}
              onToggle={(v) => toggleItem(fundingRounds, setFundingRounds, v)}
              label="Levée de fonds"
            />
          </div>
          <div>
            <p className={SUB_LABEL}>Chiffre d&apos;affaires annuel (USD)</p>
            <div className="flex gap-2">
              <input
                type="number" value={revenueMin} onChange={(e) => setRevenueMin(e.target.value)}
                placeholder="Min"
                aria-label="Chiffre d'affaires minimum (USD)"
                className={`${TEXT_INPUT} flex-1 font-mono`}
              />
              <input
                type="number" value={revenueMax} onChange={(e) => setRevenueMax(e.target.value)}
                placeholder="Max"
                aria-label="Chiffre d'affaires maximum (USD)"
                className={`${TEXT_INPUT} flex-1 font-mono`}
              />
            </div>
          </div>
          <div>
            <p className={SUB_LABEL}>Année de fondation</p>
            <div className="flex gap-2">
              <input
                type="number" value={foundedMin} onChange={(e) => setFoundedMin(e.target.value)}
                placeholder="ex : 2015"
                aria-label="Fondée au plus tôt en"
                className={`${TEXT_INPUT} flex-1 font-mono`}
              />
              <input
                type="number" value={foundedMax} onChange={(e) => setFoundedMax(e.target.value)}
                placeholder="ex : 2024"
                aria-label="Fondée au plus tard en"
                className={`${TEXT_INPUT} flex-1 font-mono`}
              />
            </div>
          </div>
          <div>
            <p className={SUB_LABEL}>Siège de l&apos;entreprise</p>
            <MultiText value={orgLocations} onChange={setOrgLocations} placeholder="ex : France, Germany..." label="Siège de l'entreprise" />
          </div>
          <div>
            <p className={SUB_LABEL}>Exclure pays</p>
            <MultiText value={excludeLocations} onChange={setExcludeLocations} placeholder="ex : Russia, Iran..." label="Exclure pays" />
          </div>
        </Section>

        {/* ENTERPRISE section: intent signals and tech stack */}
        <Section
          title="Signaux d'intention (Enterprise)"
          icon={Rocket}
          defaultOpen={false}
          locked={!can('recentlyJoined')}
          minPlan={getMinPlanForFilter('recentlyJoined')}
          onUpgrade={handleUpgrade('recentlyJoined')}
        >
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox" checked={recentlyJoined}
              onChange={(e) => setRecentlyJoined(e.target.checked)}
              className="rounded border-border bg-white/5 accent-cyan"
            />
            <span className="text-xs text-white/80">Vient d&apos;arriver dans l&apos;entreprise (90 derniers jours)</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox" checked={recentNews}
              onChange={(e) => setRecentNews(e.target.checked)}
              className="rounded border-border bg-white/5 accent-cyan"
            />
            <span className="text-xs text-white/80">A reçu de la presse récemment</span>
          </label>
          <div>
            <p className={SUB_LABEL}>Levée de fonds récente</p>
            <ChipGroup
              options={FUNDING_ROUND_OPTIONS}
              selected={recentFunding as never}
              onToggle={(v) => toggleItem(recentFunding, setRecentFunding, v)}
              label="Levée de fonds récente"
            />
          </div>
          <div>
            <p className={SUB_LABEL}>Utilise ces technologies</p>
            <MultiText value={usingTechAny} onChange={setUsingTechAny} placeholder="ex : Hubspot, Salesforce..." label="Utilise ces technologies" />
          </div>
          <div>
            <p className={SUB_LABEL}>N&apos;utilise pas ces technologies (opportunité)</p>
            <MultiText value={notUsingTech} onChange={setNotUsingTech} placeholder="ex : Pipedrive, Lemlist..." label="N'utilise pas ces technologies" />
          </div>
        </Section>

        {/* Number of leads */}
        <div>
          <p className={FIELD_LABEL}>Nombre de leads</p>
          <div className="flex gap-2" role="group" aria-label="Nombre de leads">
            {LEAD_COUNTS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setLimit(n)}
                aria-pressed={limit === n}
                className={`flex-1 rounded-md border py-2 font-mono text-xs font-bold tabular-nums transition-colors duration-150 ease-signal ${limit === n ? CHIP_ON : CHIP_OFF}`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* What the run does, in order (app/api/leads/search/stream/route.ts) */}
        <div className="rounded-[10px] border border-border p-4">
          <p className="mb-2 font-mono text-xs text-muted">Ce que fait la prospection</p>
          <ol className="space-y-1.5">
            {[
              { step: '1', label: 'Recherche des comptes',   desc: 'contacts B2B qui correspondent au ciblage' },
              { step: '2', label: 'Vérification des e-mails', desc: 'adresse trouvée puis contrôlée' },
              { step: '3', label: 'Score de priorité',        desc: 'note de 0 à 100 selon votre cible' },
            ].map(({ step, label, desc }) => (
              <li key={step} className="flex items-start gap-2">
                <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border border-cyan/25 font-mono text-[11px] font-bold text-cyan">{step}</span>
                <p className="text-[11px]">
                  <span className="font-semibold text-white/80">{label}</span>
                  <span className="text-muted"> : {desc}</span>
                </p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Dialog>
  )
}
