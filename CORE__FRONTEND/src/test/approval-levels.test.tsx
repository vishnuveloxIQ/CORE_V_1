import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { describe, expect, it } from 'vitest'
import { LevelFields } from '@/modules/approvals/components/LevelFields'
import { blankLevel, blankLevels, MAX_LEVELS, versionSchema, withLastLevelRules } from '@/modules/approvals/utils/schema'
import { requestFrom, type RequestRecord } from '@/modules/core-data/api/approvals'
import { todayISO } from '@/shared/lib/format'

// CORE-21-01/03/04: approval chains have 1 to 4 levels (a new chain starts with one), the last level only reminds, and a request shows the levels
// fixed when it was raised (the server snapshot). Example data is fictional.

const approver = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`
const levels = (n: number) => withLastLevelRules(Array.from({ length: n }, (_, i) => ({ ...blankLevel(i), approverId: approver(i + 1) })))
const version = (n: number) => ({ levels: levels(n), effectiveFrom: todayISO(), reason: 'Level count check' })

describe('approval chain levels', () => {
  it('accepts 1 to 4 levels, and refuses none and 5', () => {
    expect(versionSchema.safeParse(version(1)).success).toBe(true)
    expect(versionSchema.safeParse(version(MAX_LEVELS)).success).toBe(true)
    expect(versionSchema.safeParse(version(0)).success).toBe(false)
    expect(versionSchema.safeParse(version(MAX_LEVELS + 1)).success).toBe(false)
  })

  it('never escalates: every level reminds its own approver, and no level names someone to escalate to', () => {
    const three = withLastLevelRules([{ ...blankLevel(0), escalateToId: approver(9) }, blankLevel(1), { ...blankLevel(2), escalateToId: approver(8) }])
    expect(three.map((l) => l.onTimeout)).toEqual(['Remind approver only', 'Remind approver only', 'Remind approver only'])
    expect(three.map((l) => l.escalateToId)).toEqual([undefined, undefined, undefined])
    const four = withLastLevelRules([...three, blankLevel(3)])
    expect(four.every((l) => l.onTimeout === 'Remind approver only')).toBe(true)
    expect(blankLevel(0).onTimeout).toBe('Remind approver only')
    expect(blankLevels()).toHaveLength(1)
    expect(MAX_LEVELS).toBe(4)
  })

  it('the level editor starts with one level, adds up to 4 and removes the last one', async () => {
    function Harness() {
      const { register, control, formState: { errors } } = useForm({ defaultValues: { levels: blankLevels() } })
      const watched = useWatch({ control, name: 'levels' })
      const { append, remove } = useFieldArray({ control, name: 'levels' })
      return <LevelFields register={register} errors={errors} levels={watched} onAdd={() => append(blankLevel(watched.length))} onRemove={() => remove(watched.length - 1)} />
    }
    const user = userEvent.setup()
    render(<Harness />)
    expect(screen.getByText(`1 of up to ${MAX_LEVELS} levels`)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Remove level/ })).toBeNull()
    for (let n = 1; n < MAX_LEVELS; n += 1) await user.click(screen.getByRole('button', { name: 'Add level' }))
    expect(screen.getByText(`${MAX_LEVELS} of up to ${MAX_LEVELS} levels`)).toBeInTheDocument()
    expect(screen.getByText(`Level ${MAX_LEVELS}`)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add level' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: `Remove level ${MAX_LEVELS}` }))
    expect(screen.queryByText(`Level ${MAX_LEVELS}`)).toBeNull()
    expect(screen.getByRole('button', { name: 'Add level' })).toBeEnabled()
  })
})

describe('a request read from the server', () => {
  const record = (extra: Partial<RequestRecord>): RequestRecord => ({
    id: 'r1', code: 'APR-2026-0001', requestType: 'Material', module: 'stores', title: 'Cement', amount: 500, status: 'pending', emergency: false,
    locationId: null, chainageMarkerId: null, raisedById: approver(1), raisedByName: 'Raiser', raisedAt: '2026-11-21T10:00:00Z',
    chainId: 'c1', matrixVersionId: 'v1', matrixVersion: 1, currentLevel: 1, payloadJson: {}, assignedActorId: approver(2), decidedAt: null, rowVersion: 1,
    ...extra,
  })

  it('keeps the levels fixed when it was raised, with their own level numbers', () => {
    const req = requestFrom(record({
      locationId: 'site-1',
      levelsSnapshot: [
        { id: 'l1', matrixVersionId: 'v1', levelNo: 1, approverUserId: approver(2), timeoutHours: 24, onTimeout: 'escalate', cashLimitInr: null, escalateToUserId: null, amountFrom: 0, amountTo: null, rowVersion: 1 },
        { id: 'l3', matrixVersionId: 'v1', levelNo: 3, approverUserId: approver(3), timeoutHours: 48, onTimeout: 'remind', cashLimitInr: null, escalateToUserId: null, amountFrom: 0, amountTo: null, rowVersion: 1 },
      ] as unknown as RequestRecord['levelsSnapshot'],
    }))
    expect(req.levelsSnapshot?.map((l) => [l.levelNo, l.approverId])).toEqual([[1, approver(2)], [3, approver(3)]])
    expect(req.locationId).toBe('site-1')
  })

  it('a request with no site and no snapshot maps to none of either', () => {
    const req = requestFrom(record({}))
    expect(req.levelsSnapshot).toEqual([])
    expect(req.locationId).toBeNull()
  })
})
