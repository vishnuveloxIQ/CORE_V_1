import { zodResolver } from '@hookform/resolvers/zod'
import { useWatch } from 'react-hook-form';
import { useGuardedForm as useForm } from '@/shared/lib/useGuardedForm';
import { Button } from '@/shared/ui/Button'
import { Muted } from '@/shared/ui/Extras'
import { FormGroup, Input, Select, Textarea } from '@/shared/ui/Field'
import type { Role } from '@/modules/core-data'
import { a11y } from '@/shared/lib/core'
import { useRemoteSave } from '@/shared/hooks/useRemoteSave'
import { Icon } from '@/shared/ui/icons'
import { notify } from '@/shared/lib/toast'
import { newId, useCore } from '@/modules/core-data'
import { descendants, GRADES, gradeBand, roleRules, roleSchema, type RoleValues } from '../utils/org'

/** Create or edit a role. `preset` fills a new role, e.g. reports-to from the organogram. */
export function RoleForm({ role, preset, onDone }: { role?: Role; preset?: Partial<RoleValues>; onDone: (id?: string) => void }) {
  const { roles, departments, saveRoleRemote, loadOrganisation } = useCore()
  const { run, error: formError, saving } = useRemoteSave(() => loadOrganisation(true))
  const defaults: RoleValues = role
    ? { ...role, grade: role.grade as RoleValues['grade'], reportsToId: role.reportsToId ?? '' }
    : { title: '', code: '', departmentId: '', grade: 'S2', reportsToId: '', positions: 1, holder: '', description: '', status: 'Active', ...preset }
  const { register, handleSubmit, setError, control, formState: { errors: e } } = useForm<RoleValues>({ resolver: zodResolver(roleSchema), defaultValues: defaults })
  const [positions, departmentId] = useWatch({ control, name: ['positions', 'departmentId'] })
  const below = role ? descendants(roles, role.id) : new Set<string>()
  const bosses = roles.filter((r) => r.id !== role?.id && !below.has(r.id) && r.status === 'Active')
  const deptName = (id: string) => departments.find((d) => d.id === id)?.name ?? ''

  const submit = handleSubmit(async (v) => {
    const problems = roleRules(v, role?.id, roles, departments)
    if (problems.length) return problems.forEach(([f, m]) => setError(f, { message: m }))
    const next = { ...v, id: role?.id ?? newId(), reportsToId: v.reportsToId || null, holder: v.positions === 1 ? v.holder : '' }
    const FIELD: Record<string, keyof RoleValues> = { code: 'code', title: 'title', departmentId: 'departmentId', grade: 'grade', reportsToPositionId: 'reportsToId', plannedPositions: 'positions', description: 'description', status: 'status' }
    const saved = await run(next, (key) => saveRoleRemote(next, key), (f, m) => { if (!FIELD[f]) return false; setError(FIELD[f], { message: m }); return true })
    if (!saved) return
    notify(role ? `${v.title} saved` : `${v.title} added to the organisation`)
    onDone(saved.id)
  })

  return (
    <form noValidate onSubmit={submit}>
      {formError && <div className="login-error" role="alert" style={{ marginBottom: 14 }}><Icon name="alert" /><span>{formError}</span></div>}
      <div className="form-grid">
        <FormGroup label="Role title" required error={e.title?.message}>{(id, d) => <Input placeholder="Enter role title" {...a11y(id, d, e.title?.message)} {...register('title')} />}</FormGroup>
        <FormGroup label="Role code" required error={e.code?.message}>{(id, d) => <Input placeholder="Enter role code" {...a11y(id, d, e.code?.message)} {...register('code', { setValueAs: (x: string) => x.toUpperCase() })} />}</FormGroup>
        <FormGroup label="Department" required error={e.departmentId?.message}>
          {(id, d) => <Select {...a11y(id, d, e.departmentId?.message)} {...register('departmentId')}><option value="">Choose…</option>{departments.filter((x) => x.status === 'Active' || x.id === role?.departmentId).map((x) => <option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}</Select>}
        </FormGroup>
        <FormGroup label="Grade" required error={e.grade?.message} helper="E executive · M manager · S staff · W workmen">
          {(id, d) => <Select {...a11y(id, d, e.grade?.message)} {...register('grade')}>{GRADES.map((g) => <option key={g} value={g}>{g} · {gradeBand(g)}</option>)}</Select>}
        </FormGroup>
        <FormGroup label="Reports to" full error={e.reportsToId?.message} helper={role && below.size ? `Roles below this one (${below.size}) are left out to avoid loops.` : 'Leave empty only for the top of the organisation.'}>
          {(id, d) => (
            <Select {...a11y(id, d, e.reportsToId?.message)} {...register('reportsToId')}>
              <option value="">No one (top of the organisation)</option>
              {bosses.map((r) => <option key={r.id} value={r.id}>{r.title} · {deptName(r.departmentId)}{r.holder ? ` · ${r.holder}` : ''}</option>)}
            </Select>
          )}
        </FormGroup>
        <FormGroup label="Planned positions" required error={e.positions?.message} helper="How many people this role needs.">
          {(id, d) => <Input type="number" min={1} {...a11y(id, d, e.positions?.message)} {...register('positions', { valueAsNumber: true })} />}
        </FormGroup>
        <FormGroup label="Held by" error={e.holder?.message} helper={positions === 1 ? 'Optional. Leave empty if the role is vacant.' : 'Only for single-position roles. People are managed in HRMS.'}>
          {(id, d) => <Input placeholder={positions === 1 ? 'Enter role holder name' : 'Multiple holders assigned'} readOnly={positions !== 1} {...a11y(id, d, e.holder?.message)} {...register('holder')} />}
        </FormGroup>
        <FormGroup label="What the role does" full error={e.description?.message}>{(id, d) => <Textarea rows={2} placeholder="Enter a brief description of this role" {...a11y(id, d, e.description?.message)} {...register('description')} />}</FormGroup>
        <FormGroup label="Status" error={e.status?.message}>{(id, d) => <Select {...a11y(id, d, e.status?.message)} {...register('status')}><option>Active</option><option>Inactive</option></Select>}</FormGroup>
        <div className="form-group" style={{ alignSelf: 'end' }}>{departmentId && <Muted>Shown on the organogram in {deptName(departmentId)} colours.</Muted>}</div>
      </div>
      <div className="form-actions">
        <Button onClick={() => onDone()}>Cancel</Button>
        <Button type="submit" tone="primary" icon="check" disabled={saving}>{role ? 'Save role' : 'Add role'}</Button>
      </div>
    </form>
  )
}
