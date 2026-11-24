import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useGuardedForm as useForm } from '@/shared/lib/useGuardedForm';
import { PhoneField } from '@/shared/ui/PhoneField'
import { DEFAULT_COUNTRY } from '@/shared/lib/countryCodes'
import { Button } from '@/shared/ui/Button'
import { FormGroup, Input, Select } from '@/shared/ui/Field'
import type { Site } from '@/modules/core-data'
import { a11y } from '@/shared/lib/core'
import { ApiError, errorText, fieldErrors, idempotencyKey } from '@/shared/lib/api'
import { useCore } from '@/modules/core-data'
import { siteSchema as schema } from '../utils/site/schema'

/** A coordinate typed in the form: blank is not set; anything else is read as a number (NaN fails validation). */
const coordinate = (v: unknown) => (v === '' || v === null || v === undefined ? null : typeof v === 'number' ? v : Number(String(v).trim()))

/**
 * Location form. A new location is created on the server for one project (core_location.project_id), which cannot
 * change afterwards. Nothing is saved in the browser only.
 */
export function SiteForm({ site, defaultProjectId, onSaved, onCancel }: { site?: Site; /** the project to pre-select on a new location */ defaultProjectId?: string; onSaved: (id: string) => void; onCancel: () => void }) {
  const { sites, projects, createSiteRemote, updateSiteRemote, loadSites } = useCore()
  const [country, setCountry] = useState(DEFAULT_COUNTRY)
  const [projectId, setProjectId] = useState(defaultProjectId ?? '')
  const [projectError, setProjectError] = useState('')
  const [formError, setFormError] = useState('')
  // one Idempotency-Key per action; only a retry of the same values after a lost connection reuses it
  const [pending, setPending] = useState<{ key: string; body: string } | null>(null)
  const { register, handleSubmit, setError, formState: { errors: e, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: site
      ? { code: site.code, name: site.name, addressLine: site.addressLine, city: site.city, state: site.state, pin: site.pin, inCharge: site.inCharge, phone: site.phone, email: site.email, status: site.status, latitude: site.latitude ?? null, longitude: site.longitude ?? null }
      : { code: '', name: '', addressLine: '', city: '', state: 'Telangana', pin: '', inCharge: '', phone: '', email: '', status: 'Active' as const, latitude: null, longitude: null },
  })
  const project = projects.find((p) => p.id === (site?.projectId ?? projectId))
  const submit = handleSubmit(async (v) => {
    setFormError('')
    if (sites.some((s) => s.code === v.code && s.id !== site?.id)) return setError('code', { message: 'Another location uses this code.' })
    if (!site && !projectId) return setProjectError('Choose the project this location belongs to.')
    const body = JSON.stringify({ v, projectId })
    const key = pending?.body === body ? pending.key : idempotencyKey()
    setPending({ key, body })
    try {
      const saved = site ? await updateSiteRemote(site.id, v, key) : await createSiteRemote(projectId, v, key)
      setPending(null)
      onSaved(saved.id)
    } catch (err) {
      if (!(err instanceof ApiError) || err.code !== 'NETWORK_ERROR') setPending(null)
      if (err instanceof ApiError && err.code.endsWith('_DUPLICATE')) return setError('code', { message: 'Another location uses this code.' })
      if (err instanceof ApiError && err.code === 'VERSION_CONFLICT') {
        await loadSites()
        return setFormError('Someone else changed this location. The latest version is loaded; check it and save again.')
      }
      const fields = Object.entries(fieldErrors(err)).filter(([f]) => f in v)
      fields.forEach(([f, m]) => setError(f as keyof typeof v, { message: m }))
      setFormError(fields.length ? 'Check the highlighted fields.' : errorText(err))
    }
  })
  return (
    <form noValidate onSubmit={submit}>
      {formError && <div className="login-error" role="alert" style={{ marginBottom: 14 }}><span>{formError}</span></div>}
      <div className="form-grid">
        <FormGroup label="Location name" required error={e.name?.message}>{(id, d) => <Input {...a11y(id, d, e.name?.message)} {...register('name')} />}</FormGroup>
        <FormGroup label="Location code" required error={e.code?.message}>{(id, d) => <Input className="uppercase" {...a11y(id, d, e.code?.message)} {...register('code', { setValueAs: (v: string) => v.toUpperCase() })} />}</FormGroup>
        {(site
          ? <FormGroup label="Project" helper="A location stays with the project it was created for.">{(id) => <Input id={id} value={project ? `${project.name} (${project.code})` : '—'} readOnly />}</FormGroup>
          : <FormGroup label="Project" required error={projectError || undefined} helper="A location belongs to one project and cannot be moved later.">
              {(id, d) => (
                <Select {...a11y(id, d, projectError)} value={projectId} onChange={(ev) => { setProjectId(ev.target.value); setProjectError('') }}>
                  <option value="">Choose…</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
                </Select>
              )}
            </FormGroup>)}
        <FormGroup label="Status">{(id) => <Select id={id} {...register('status')}><option>Active</option><option>Inactive</option></Select>}</FormGroup>
        <FormGroup label="Address" required full error={e.addressLine?.message}>{(id, d) => <Input {...a11y(id, d, e.addressLine?.message)} {...register('addressLine')} />}</FormGroup>
        <FormGroup label="City" required error={e.city?.message}>{(id, d) => <Input {...a11y(id, d, e.city?.message)} {...register('city')} />}</FormGroup>
        <FormGroup label="State" required error={e.state?.message}>{(id, d) => <Input {...a11y(id, d, e.state?.message)} {...register('state')} />}</FormGroup>
        <FormGroup label="PIN code" required error={e.pin?.message}>{(id, d) => <Input inputMode="numeric" maxLength={6} {...a11y(id, d, e.pin?.message)} {...register('pin')} />}</FormGroup>
        <FormGroup label="Location in-charge" required error={e.inCharge?.message}>{(id, d) => <Input {...a11y(id, d, e.inCharge?.message)} {...register('inCharge')} />}</FormGroup>
        <FormGroup label="Incharge mobile number" required error={e.phone?.message}>{(id, d) => <PhoneField country={country} onCountry={setCountry} placeholder="Enter mobile number" {...a11y(id, d, e.phone?.message)} {...register('phone')} />}</FormGroup>
        <FormGroup label="Email" required error={e.email?.message}>{(id, d) => <Input type="email" {...a11y(id, d, e.email?.message)} {...register('email')} />}</FormGroup>
        <FormGroup label="Latitude" error={e.latitude?.message} helper="Decimal degrees, e.g. 17.385044. Leave blank if not known.">
          {(id, d) => <Input inputMode="decimal" placeholder="e.g. 17.385044" {...a11y(id, d, e.latitude?.message)} {...register('latitude', { setValueAs: coordinate })} />}
        </FormGroup>
        <FormGroup label="Longitude" error={e.longitude?.message} helper="Decimal degrees, e.g. 78.486671.">
          {(id, d) => <Input inputMode="decimal" placeholder="e.g. 78.486671" {...a11y(id, d, e.longitude?.message)} {...register('longitude', { setValueAs: coordinate })} />}
        </FormGroup>
      </div>
      <div className="form-actions">
        <Button onClick={onCancel} disabled={isSubmitting}>Cancel</Button>
        <Button type="submit" tone="primary" icon="check" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : site ? 'Save changes' : 'Create location'}</Button>
      </div>
    </form>
  )
}
