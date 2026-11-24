import { zodResolver } from '@hookform/resolvers/zod'
import { useWatch } from 'react-hook-form';
import { useGuardedForm as useForm } from '@/shared/lib/useGuardedForm';
import { Button } from '@/shared/ui/Button'
import { FormGroup, Input, Select, Textarea } from '@/shared/ui/Field'
import type { Department } from '@/modules/core-data'
import { a11y } from '@/shared/lib/core'
import { useRemoteSave } from '@/shared/hooks/useRemoteSave'
import { Icon } from '@/shared/ui/icons'
import { notify } from '@/shared/lib/toast'
import { newId, useCore } from '@/modules/core-data'
import { DEPT_COLOR_HEX, DEPT_COLORS, deptSchema, subDepartments, type DeptValues } from '../utils/org'

/** Create or edit a department. */
export function DepartmentForm({ dept, onDone }: { dept?: Department; onDone: () => void }) {
  const { departments, roles, saveDepartmentRemote, loadOrganisation } = useCore()
  const { run, error: formError, saving } = useRemoteSave(() => loadOrganisation(true))
  const defaults: DeptValues = dept
    ? { ...dept, parentId: dept.parentId ?? '', headRoleId: dept.headRoleId ?? '', colorHex: dept.colorHex ?? DEPT_COLOR_HEX[dept.color % DEPT_COLOR_HEX.length] }
    : { code: '', name: '', parentId: '', headRoleId: '', description: '', color: departments.length % DEPT_COLORS.length, colorHex: DEPT_COLOR_HEX[departments.length % DEPT_COLOR_HEX.length], status: 'Active' }
  const { register, handleSubmit, setError, setValue, control, formState: { errors: e } } = useForm<DeptValues>({ resolver: zodResolver(deptSchema), defaultValues: defaults })
  const color = useWatch({ control, name: 'color' })
  const colorHex = useWatch({ control, name: 'colorHex' }) ?? ''
  const validHex = /^#[0-9a-fA-F]{6}$/.test(colorHex)
  const below = dept ? subDepartments(departments, dept.id) : new Set<string>()
  const parents = departments.filter((d) => d.id !== dept?.id && !below.has(d.id) && d.status === 'Active')
  const ownRoles = dept ? roles.filter((r) => r.departmentId === dept.id && r.status === 'Active') : []

  const submit = handleSubmit(async (v) => {
    const others = departments.filter((d) => d.id !== dept?.id)
    if (others.some((d) => d.code === v.code)) return setError('code', { message: 'Another department uses this code.' })
    if (others.some((d) => d.name.toLowerCase() === v.name.toLowerCase())) return setError('name', { message: 'Another department has this name.' })
    if (dept && v.status === 'Inactive') {
      if (ownRoles.length) return setError('status', { message: `${ownRoles.length} active role${ownRoles.length === 1 ? ' is' : 's are'} in this department. Move or deactivate ${ownRoles.length === 1 ? 'it' : 'them'} first.` })
      const subs = departments.filter((d) => d.parentId === dept.id && d.status === 'Active')
      if (subs.length) return setError('status', { message: `${subs.map((d) => d.name).join(', ')} sit${subs.length === 1 ? 's' : ''} under it. Move or deactivate ${subs.length === 1 ? 'it' : 'them'} first.` })
    }
    // a palette choice always goes with its hex; a typed hex replaces it
    const next = { ...v, id: dept?.id ?? newId(), parentId: v.parentId || null, headRoleId: v.headRoleId || null, colorHex: v.colorHex || DEPT_COLOR_HEX[v.color % DEPT_COLOR_HEX.length] }
    const FIELD: Record<string, keyof DeptValues> = { code: 'code', name: 'name', description: 'description', status: 'status', parentDepartmentId: 'parentId', headPositionId: 'headRoleId', colorHex: 'colorHex' }
    const saved = await run(next, (key) => saveDepartmentRemote(next, key), (f, m) => { if (!FIELD[f]) return false; setError(FIELD[f], { message: m }); return true })
    if (!saved) return
    notify(dept ? `${v.name} saved` : `${v.name} department created`)
    onDone()
  })

  return (
    <form noValidate onSubmit={submit}>
      {formError && <div className="login-error" role="alert" style={{ marginBottom: 14 }}><Icon name="alert" /><span>{formError}</span></div>}
      <div className="form-grid">
        <FormGroup label="Department name" required error={e.name?.message}>{(id, d) => <Input placeholder="Enter department name" {...a11y(id, d, e.name?.message)} {...register('name')} />}</FormGroup>
        <FormGroup label="Department code" required error={e.code?.message}>{(id, d) => <Input placeholder="Enter department code" {...a11y(id, d, e.code?.message)} {...register('code', { setValueAs: (x: string) => x.toUpperCase() })} />}</FormGroup>
        <FormGroup label="Part of" helper="Optional parent department.">
          {(id, d) => <Select {...a11y(id, d)} {...register('parentId')}><option value="">None (top-level department)</option>{parents.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</Select>}
        </FormGroup>
        <FormGroup label="Head role" helper={dept ? (ownRoles.length ? 'The role that leads this department.' : 'Add roles to this department first.') : 'Add roles after creating the department.'}>
          {(id, d) => <Select {...a11y(id, d)} {...register('headRoleId')}><option value="">Not set</option>{ownRoles.map((r) => <option key={r.id} value={r.id}>{r.title}{r.holder ? ` · ${r.holder}` : ''}</option>)}</Select>}
        </FormGroup>
        <FormGroup label="Status" error={e.status?.message}>{(id, d) => <Select {...a11y(id, d, e.status?.message)} {...register('status')}><option>Active</option><option>Inactive</option></Select>}</FormGroup>
        <fieldset className="form-group full" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontSize: 13, fontWeight: 650, marginBottom: 8 }}>Colour on the organogram</legend>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
            <div className="swatches" role="radiogroup" aria-label="Colour on the organogram">
              {DEPT_COLORS.map((c, i) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={colorHex ? colorHex.toUpperCase() === DEPT_COLOR_HEX[i] : color === i}
                  aria-label={`Colour ${i + 1}`}
                  className="swatch"
                  style={{ ['--sw' as string]: c }}
                  onClick={() => {
                    setValue('color', i, { shouldDirty: true });
                    setValue('colorHex', DEPT_COLOR_HEX[i], { shouldDirty: true, shouldValidate: true });
                  }}
                />
              ))}
            </div>
            <input type="color" aria-label="Pick a custom colour" value={validHex ? colorHex : '#1a73e8'} onChange={(ev) => setValue('colorHex', ev.target.value.toUpperCase(), { shouldDirty: true, shouldValidate: true })} style={{ width: 40, height: 34, padding: 2, border: '1px solid var(--line)', borderRadius: 8, background: 'transparent' }} />
            <Input style={{ maxWidth: 160 }} placeholder="Enter hex colour, e.g. #1A73E8" aria-label="Custom hex colour" aria-invalid={!!e.colorHex} {...register('colorHex')} />
            {e.colorHex && <span role="alert" style={{ color: 'var(--c-red)', fontSize: 12 }}>{e.colorHex.message}</span>}
          </div>
        </fieldset>
        <FormGroup label="Description" full error={e.description?.message}>{(id, d) => <Textarea rows={2} {...a11y(id, d, e.description?.message)} {...register('description')} />}</FormGroup>
      </div>
      <div className="form-actions">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" tone="primary" icon="check" disabled={saving}>{dept ? 'Save department' : 'Create department'}</Button>
      </div>
    </form>
  )
}
