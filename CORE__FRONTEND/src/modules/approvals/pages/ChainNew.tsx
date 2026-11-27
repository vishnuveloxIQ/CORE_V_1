import { zodResolver } from '@hookform/resolvers/zod'
import { useRef } from 'react'
import { useFieldArray, useWatch } from 'react-hook-form';
import { useGuardedForm as useForm } from '@/shared/lib/useGuardedForm';
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { FirstVersion, MiniTable, Muted, Note, VersionFields } from '@/shared/ui/Extras'
import { CheckRow, FormGroup, Select } from '@/shared/ui/Field'
import { PageHead } from '@/modules/shell'
import { StatusBadge } from '@/shared/ui/Status'
import type { ModuleName, RequestType, ScopeType } from '@/modules/core-data'
import { useEnter } from '@/shared/hooks/useMotion'
import { a11y } from '@/shared/lib/core'
import { scopeText } from '@/modules/core-data'
import { fmtDate } from '@/shared/lib/format'
import { notify } from '@/shared/lib/toast'
import { useRemoteSave } from '@/shared/hooks/useRemoteSave'
import { chainState, useCore } from '@/modules/core-data'
import { LevelFields } from '../components/LevelFields'
import { blankLevel, blankLevels, newChainDefaults, newChainSchema, REQUEST_TYPES, scopeClashes, withLastLevelRules } from '../utils/schema'

/** Which module raises each request type, used when no company chain exists to copy from. */
const ORIGIN: Record<RequestType, { module: ModuleName; raisedBy: string }> = {
  'Onboarded employee list': { module: 'HRMS', raisedBy: 'HRMS' },
  'Offer letter': { module: 'HRMS', raisedBy: 'HRMS' },
  'Job opening': { module: 'HRMS', raisedBy: 'Any module, via HRMS' },
  'Manpower requisition': { module: 'HRMS', raisedBy: 'HRMS or module head' },
  'Equipment': { module: 'P&M', raisedBy: 'Module head' },
  'Material': { module: 'Stores', raisedBy: 'Module head or store' },
  'Advance payment': { module: 'PMS', raisedBy: 'Module head or user' },
  Recruitment: { module: 'HRMS', raisedBy: 'Module head' },
  'Employee transfer': { module: 'HRMS', raisedBy: 'HRMS' },
  Promotion: { module: 'HRMS', raisedBy: 'HRMS' },
  'Bonus and incentive': { module: 'HRMS', raisedBy: 'HRMS' },
  'Loan and advance': { module: 'HRMS', raisedBy: 'HRMS' },
  Payments: { module: 'PMS', raisedBy: 'Module head or user' },
}

const SCOPES: { value: ScopeType; title: string; help: string }[] = [
  { value: 'Company', title: 'Whole company', help: 'Used when no project chain is set for this request type. One per request type.' },
  { value: 'Project', title: 'One or more projects', help: 'Applies to requests raised against the chainages of the chosen projects. Takes priority over the company chain.' },
]

/** /approval-matrix/new — create a chain for a request type at company or project scope. */
export default function ChainNew() {
  const ref = useRef<HTMLDivElement>(null)
  useEnter(ref, 'chain-new')
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { chains, projects, addChain, loadChains } = useCore()
  // each chain, its first version, levels and publish are written to the API; the chains are re-read afterwards
  const { run, error: saveError, saving } = useRemoteSave(loadChains)
  const preset = REQUEST_TYPES.find((t) => t === params.get('type'))
  const { register, handleSubmit, control, setValue, setError, formState: { errors } } = useForm({ resolver: zodResolver(newChainSchema), defaultValues: newChainDefaults(preset) })
  const [requestType, scopeType, scopeIds, levels] = useWatch({ control, name: ['requestType', 'scopeType', 'scopeIds', 'levels'] })
  const { append, remove, replace } = useFieldArray({ control, name: 'levels' })
  const options = scopeType === 'Project' ? projects.map((p) => ({ id: p.id, label: `${p.code} · ${p.name}` })) : []
  const sameType = requestType ? chains.filter((c) => c.requestType === requestType) : []
  const company = sameType.find((c) => c.scopeType === 'Company')
  const clashes = requestType ? scopeClashes(chains, requestType, scopeType, scopeIds ?? []) : []
  const back = <Button icon="chevL" onClick={() => navigate('/approval-matrix')}>Back to matrix</Button>

  const copyCompany = () => {
    if (!company) return
    // the company chain's levels, however many it has
    const copied = chainState(company).current.levels.map((l) => ({
      approverId: l.approverId,
      timeoutHours: l.timeoutHours,
      onTimeout: l.onTimeout,
      cashLimit: requestType === 'Payments' ? l.cashLimit : undefined,
    }))
    replace(withLastLevelRules(copied.length ? copied : blankLevels(1)))
    notify('Levels copied from the company chain. Change what differs.')
  }

  const submit = handleSubmit(async (v) => {
    const taken = scopeClashes(chains, v.requestType, v.scopeType, v.scopeIds)
    if (taken.length) {
      return setError(v.scopeType === 'Company' ? 'requestType' : 'scopeIds', { message: v.scopeType === 'Company'
        ? `${v.requestType} already has a company chain (${taken[0].id}). Edit that one instead.`
        : `Already covered by ${taken.map((c) => `${c.id} (${scopeText(c.scopeType, c.scopeIds.filter((x) => v.scopeIds.includes(x)), projects)})`).join(', ')}. Untick those or edit that chain.` })
    }
    const origin = company ? { module: company.module, raisedBy: company.raisedBy } : ORIGIN[v.requestType]
    const levels = withLastLevelRules(v.levels.map((l) => ({ ...l, cashLimit: v.requestType === 'Payments' ? l.cashLimit : undefined })))
    const chain = { requestType: v.requestType, name: `${v.requestType} chain`, isActive: true, timeoutHours: 48, ...origin, scopeType: v.scopeType, scopeIds: v.scopeType === 'Company' ? [] : v.scopeIds }
    const version = { levels, effectiveFrom: v.effectiveFrom, reason: v.reason }
    const id = await run({ chain, version }, () => addChain(chain, version))
    if (!id) return
    notify(`${v.requestType} chain created for ${scopeText(v.scopeType, v.scopeIds, projects).toLowerCase()}`)
    navigate(`/approval-matrix/${id}`)
  })

  return (
    <div ref={ref}>
      <PageHead crumb="New approval chain" title="New approval chain" desc="Choose the request type and where the chain applies, then set the approvers: start with one level and add up to four." actions={back} />
      <div className="form-layout">
        <Card title="Chain details">
          <form noValidate onSubmit={submit}>
            {saveError && <div className="login-error" role="alert" style={{ marginBottom: 14 }}><span>{saveError}</span></div>}
            <h3 className="section-t">1. Request details</h3>
            <div className="form-grid">
              <FormGroup label="Request type" required full error={errors.requestType?.message}
                helper={requestType ? `Raised by ${(company ?? ORIGIN[requestType]).raisedBy} in ${(company ?? ORIGIN[requestType]).module}. ${sameType.length} chain${sameType.length === 1 ? '' : 's'} already exist${sameType.length === 1 ? 's' : ''} for it.` : undefined}>
                {(id, d) => <Select {...a11y(id, d, errors.requestType?.message)} {...register('requestType')}><option value="">Choose…</option>{REQUEST_TYPES.map((t) => <option key={t}>{t}</option>)}</Select>}
              </FormGroup>
            </div>

            <h3 className="section-t">2. Where it applies</h3>
            <div className="radio-cards" role="radiogroup" aria-label="Scope">
              {SCOPES.map((s) => (
                <label className="radio-card" key={s.value}>
                  <input type="radio" value={s.value} {...register('scopeType', { onChange: () => setValue('scopeIds', []) })} />
                  <div><strong>{s.title}</strong><span>{s.help}</span></div>
                </label>
              ))}
            </div>
            {scopeType !== 'Company' && (
              <fieldset className="form-group full" style={{ border: 0, padding: 0, margin: '14px 0 0' }}>
                <legend style={{ fontSize: 13, fontWeight: 650, marginBottom: 8 }}>Projects <span className="required">*</span></legend>
                <div className="check-grid">{options.map((o) => <CheckRow key={o.id} label={o.label} value={o.id} {...register('scopeIds')} />)}</div>
                {errors.scopeIds?.message && <span className="helper" role="alert" style={{ color: 'var(--red)' }}>{errors.scopeIds.message}</span>}
              </fieldset>
            )}
            {clashes.length > 0 && (
              <Note title="Overlaps an existing chain" icon="alert">
                {clashes.map((c) => `${c.id} already covers ${scopeText(c.scopeType, c.scopeIds, projects).toLowerCase()}`).join('; ')}. Pick different projects or edit that chain.
              </Note>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <h3 className="section-t">3. Approvers</h3>
              {company && <Button size="sm" icon="copy" onClick={copyCompany}>Copy from company chain</Button>}
            </div>
            <LevelFields register={register} errors={errors} levels={levels} cashLimit={requestType === 'Payments'}
              onAdd={() => append(blankLevel(levels.length))} onRemove={() => remove(levels.length - 1)} />

            <h3 className="section-t">4. Effective date</h3>
            <p style={{ margin: '0 0 10px', fontSize: 13 }}><Muted>Choose the date from which new requests will follow this chain.</Muted></p>
            <FirstVersion><div className="form-grid"><VersionFields register={register} errors={errors} /></div></FirstVersion>
            <div className="form-actions">
              <Button onClick={() => navigate('/approval-matrix')}>Cancel</Button>
              <Button type="submit" tone="primary" icon="check" disabled={saving}>{saving ? 'Saving…' : 'Create chain'}</Button>
            </div>
          </form>
        </Card>
        <div className="stack">
          <Card title="How a chain is selected" subtitle="The most specific matching chain is used, in this order of priority.">
            <MiniTable head={['Priority', 'Chain', 'Used when']} rows={[
              [<strong key="1">1</strong>, <strong key="c1">Project chain</strong>, 'The request is raised against a chainage owned by a project that has a chain.'],
              [<strong key="2">2</strong>, <strong key="c2">Company chain</strong>, 'No project chain applies.'],
            ]} />
            <Note title="Existing requests" icon="lock">Each request keeps the chain and version it was raised under.</Note>
          </Card>
          <Card title={requestType ? `Chains for ${requestType.toLowerCase()}` : 'Existing chains'} subtitle={requestType ? undefined : 'Choose a request type to see them'}>
            <MiniTable head={['Chain', 'Scope', 'Since']} empty={requestType ? 'None yet. This will be the first.' : 'Nothing selected.'} rows={sameType.map((c) => {
              const { current, ready } = chainState(c)
              return [<strong key="i">{c.id}</strong>, scopeText(c.scopeType, c.scopeIds, projects),<span key="s">{fmtDate(current.effectiveFrom)} {!ready && <StatusBadge tone="rejected">Not usable</StatusBadge>}</span>]
            })} />
          </Card>
        </div>
      </div>
    </div>
  )
}
