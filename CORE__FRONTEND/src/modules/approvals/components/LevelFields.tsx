import type { FieldErrors, UseFormRegister } from 'react-hook-form'
import { Button } from '@/shared/ui/Button'
import { FormGroup, Input, Select } from '@/shared/ui/Field'
import type { TimeoutRule } from '@/modules/core-data'
import { a11y } from '@/shared/lib/core'
import { useCore } from '@/modules/core-data'
import { MAX_LEVELS } from '../utils/schema'

interface LevelValue { approverId: string; timeoutHours: number; onTimeout: TimeoutRule; cashLimit?: number; escalateToId?: string }

/**
 * Levels L1 to L4: approver and reminder interval, and a cash limit per level for Payments. Shared by new chains and new
 * versions. The form owns the list; onAdd and onRemove add a level at the end or remove the last one.
 */
export function LevelFields({ register, errors, levels = [], cashLimit = false, onAdd, onRemove }: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: UseFormRegister<any>
  errors: FieldErrors<{ levels: LevelValue[] }>
  levels?: LevelValue[]
  cashLimit?: boolean
  onAdd?: () => void
  onRemove?: () => void
}) {
  const users = useCore((s) => s.users)
  // server users from GET /users; a suspended user reads back as Inactive and is not offered
  const approvers = users.filter((u) => u.status === 'Active').map((u) => ({ id: u.id, label: `${u.name} (${u.loginId})` }))
  const last = levels.length - 1
  const listError = (errors.levels as { message?: string; root?: { message?: string } } | undefined)
  const listMessage = listError?.message ?? listError?.root?.message
  return (
    <div className="list-rows">
      {levels.map((_, i) => {
        const e = errors.levels?.[i]
        const set = !!levels[i]?.approverId
        return (
          <div className="list-row" key={i} style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span className="step-n" style={{ width: 34, height: 34, fontSize: 12 }}>L{i + 1}</span>
              <strong style={{ fontSize: 13.5 }}>Level {i + 1}{i === 0 ? ' (required)' : ''}</strong>
              {!set && i > 0 && <span style={{ color: 'var(--muted)', fontSize: 12 }}>Not used</span>}
              {i === last && last > 0 && onRemove && (
                <Button size="sm" icon="trash" onClick={onRemove} aria-label={`Remove level ${i + 1}`} style={{ marginLeft: 'auto' }}>Remove level</Button>
              )}
            </div>
            <div className="form-grid">
              <FormGroup label="Approver" required={i === 0} full error={e?.approverId?.message}>
                {(id, d) => <Select {...a11y(id, d, e?.approverId?.message)} {...register(`levels.${i}.approverId`)}><option value="">{i === 0 ? 'Choose…' : 'Not used'}</option>{approvers.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</Select>}
              </FormGroup>
              <FormGroup label="Remind every (hours)" error={e?.timeoutHours?.message} helper="If the approver has not acted, they are reminded again after this many hours. Requests are never escalated.">
                {(id, d) => <Input type="number" min={1} {...a11y(id, d, e?.timeoutHours?.message)} {...register(`levels.${i}.timeoutHours`, { valueAsNumber: true })} />}
              </FormGroup>
              {cashLimit && (
                <FormGroup label="Cash limit (₹)" error={e?.cashLimit?.message} helper={i === last ? 'Leave blank for no limit.' : 'Blank = no limit at this level.'}>
                  {(id, d) => <Input type="number" min={1} inputMode="numeric" {...a11y(id, d, e?.cashLimit?.message)} {...register(`levels.${i}.cashLimit`, { setValueAs: (v: unknown) => (v === '' || v == null ? undefined : Number(v)) })} />}
                </FormGroup>
              )}
            </div>
          </div>
        )
      })}
      {listMessage && <div className="login-error" role="alert"><span>{listMessage}</span></div>}
      {onAdd && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Button size="sm" icon="plus" onClick={onAdd} disabled={levels.length >= MAX_LEVELS}>Add level</Button>
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>{levels.length} of up to {MAX_LEVELS} levels</span>
        </div>
      )}
    </div>
  )
}
