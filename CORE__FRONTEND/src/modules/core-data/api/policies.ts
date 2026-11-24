import { api } from '@/shared/lib/api'
import type { CustomField, CustomFieldType, CustomPolicyDef, CustomPolicyVersion, CustomValue, PolicyData, PolicyKey, PolicyVersion, RuleItem } from '../types'

/**
 * Policies (GET/POST /policies, /policy-versions, /policy-rules) and admin-defined policies (/custom-policies,
 * /custom-policy-fields, /custom-policy-versions). Writes send an Idempotency-Key (POST) and the row
 * version (publish).
 *
 * Mapping: each built-in policy (shifts, holidays, overtime, leave, payment-threshold, rules) is one /policies row
 * whose code is the policy key. Each saved version is a /policy-versions row whose body is { data } (the whole
 * policy payload) and which is published at once, because the UI treats a saved version as final.
 */

const path = (base: string, id: string) => `${base}/${encodeURIComponent(id)}`
const q = (name: string, id: string) => `?${name}=${encodeURIComponent(id)}`

// ---------- built-in policies ----------
export type PolicyKind = 'general' | 'attendance' | 'leave' | 'overtime' | 'conduct' | 'other'
export interface PolicyRecord { id: string; kind: PolicyKind; code: string; name: string; description: string | null; rowVersion: number }
export interface PolicyVersionRecord {
  id: string; policyId: string; versionNo: number; body: { data?: unknown }; effectiveFrom: string
  publishedAt: string | null; reason: string | null; rowVersion: number; createdAt: string
}
export interface PolicyRuleRecord { id: string; policyVersionId: string; title: string; category: string; body: string; ackRequired: boolean; rowVersion: number }
export interface RuleAck { id: string; [k: string]: unknown }

const KIND: Record<PolicyKey, PolicyKind> = {
  shifts: 'attendance', holidays: 'attendance', overtime: 'overtime', leave: 'leave', 'payment-threshold': 'general', rules: 'conduct',
}
const NAME: Record<PolicyKey, string> = {
  shifts: 'Shift timings', holidays: 'Holidays', overtime: 'Overtime', leave: 'Leave', 'payment-threshold': 'Payment threshold', rules: 'Company rules',
}
export const isPolicyKeyCode = (c: string): c is PolicyKey => c in KIND

// TODO(backend): created-by is not on a policy version, so the UI shows a blank author for versions read from the API
export const policyVersionFrom = (key: PolicyKey, r: PolicyVersionRecord): PolicyVersion =>
  ({ id: r.id, key, version: r.versionNo, effectiveFrom: r.effectiveFrom, reason: r.reason ?? '', createdBy: '', createdAt: r.createdAt, data: r.body.data as PolicyData[PolicyKey] }) as PolicyVersion

export const listPolicies = () => api<PolicyRecord[]>('GET', '/policies')
export const listPolicyVersions = () => api<PolicyVersionRecord[]>('GET', '/policy-versions')
export const createPolicy = (key: PolicyKey, idempotencyKey?: string) =>
  api<PolicyRecord>('POST', '/policies', { body: { kind: KIND[key], code: key, name: NAME[key] }, idempotencyKey })
export const createPolicyVersion = (policyId: string, v: { data: unknown; effectiveFrom: string; reason: string }, idempotencyKey?: string) =>
  api<PolicyVersionRecord>('POST', '/policy-versions', { body: { policyId, body: { data: v.data }, effectiveFrom: v.effectiveFrom, reason: v.reason || null }, idempotencyKey })
/** Freezes a version (POST /policy-versions/{id}/publish). Its rules cannot change afterwards. */
export const publishPolicyVersion = (id: string, rowVersion: number, idempotencyKey?: string) =>
  api<PolicyVersionRecord>('POST', `${path('/policy-versions', id)}/publish`, { body: { rowVersion }, idempotencyKey })

// ---------- policy rules (the Company rules policy) ----------
export const listPolicyRules = (policyVersionId: string) => api<PolicyRuleRecord[]>('GET', `/policy-rules${q('policyVersionId', policyVersionId)}`)
export const createPolicyRule = (policyVersionId: string, r: RuleItem, idempotencyKey?: string) =>
  api<PolicyRuleRecord>('POST', '/policy-rules', { body: { policyVersionId, title: r.title, category: r.category, body: r.body, ackRequired: r.ackRequired }, idempotencyKey })
/** The signed-in user records that they read a rule of a published version. */
export const acknowledgePolicyRule = (id: string) => api<RuleAck>('POST', `${path('/policy-rules', id)}/acknowledge`)
/** The signed-in user's own acknowledgements, newest first. */
export const listMyAcknowledgements = () => api<{ ruleId: string; ackedAt: string }[]>('GET', '/policy-rules/acknowledgements')

// ---------- custom policies ----------
export interface CustomPolicyRecord { id: string; name: string; description: string | null; rowVersion: number; createdAt: string }
export interface CustomFieldRecord {
  id: string; customPolicyId: string; label: string; fieldType: 'text' | 'number' | 'date' | 'boolean' | 'select'
  isRequired: boolean | null; optionsJson: unknown[] | null; sortOrder: number | null; rowVersion: number
}
export interface CustomVersionRecord {
  id: string; customPolicyId: string; versionNo: number; effectiveFrom: string; reason: string | null
  valuesJson: Record<string, CustomValue>; rowVersion: number; createdAt: string
}

// TODO(backend): field type 'longtext' not in API (saved as 'text', so it reads back as a single-line field)
const FIELD_TO_API: Record<CustomFieldType, CustomFieldRecord['fieldType']> = { text: 'text', longtext: 'text', number: 'number', date: 'date', yesno: 'boolean', select: 'select' }
const FIELD_FROM_API: Record<CustomFieldRecord['fieldType'], CustomFieldType> = { text: 'text', number: 'number', date: 'date', boolean: 'yesno', select: 'select' }

export const customFieldFrom = (r: CustomFieldRecord): CustomField =>
  ({ id: r.id, label: r.label, type: FIELD_FROM_API[r.fieldType], required: !!r.isRequired, ...(r.fieldType === 'select' ? { options: (r.optionsJson ?? []).map(String) } : {}) })
// TODO(backend): created-by is not on custom policies or their versions
export const customDefFrom = (r: CustomPolicyRecord, fields: CustomFieldRecord[]): CustomPolicyDef => ({
  id: r.id, name: r.name, description: r.description ?? '',
  fields: fields.filter((f) => f.customPolicyId === r.id).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).map(customFieldFrom),
  createdBy: '', createdAt: r.createdAt,
})
export const customVersionFrom = (r: CustomVersionRecord): CustomPolicyVersion =>
  ({ id: r.id, policyId: r.customPolicyId, version: r.versionNo, effectiveFrom: r.effectiveFrom, reason: r.reason ?? '', createdBy: '', createdAt: r.createdAt, values: r.valuesJson ?? {} })

export const listCustomPolicies = () => api<CustomPolicyRecord[]>('GET', '/custom-policies')
/** Deletes a custom policy with its fields and versions, in one transaction on the server (each removal is audited). */
export const deleteCustomPolicy = (id: string) => api<{ deleted: true }>('DELETE', path('/custom-policies', id))
export const listCustomFields = () => api<CustomFieldRecord[]>('GET', '/custom-policy-fields')
export const listCustomVersions = () => api<CustomVersionRecord[]>('GET', '/custom-policy-versions')
export const createCustomPolicyRow = (d: { name: string; description: string }, idempotencyKey?: string) =>
  api<CustomPolicyRecord>('POST', '/custom-policies', { body: { name: d.name, description: d.description || null }, idempotencyKey })
export const createCustomField = (customPolicyId: string, f: CustomField, sortOrder: number, idempotencyKey?: string) =>
  api<CustomFieldRecord>('POST', '/custom-policy-fields', {
    body: { customPolicyId, label: f.label, fieldType: FIELD_TO_API[f.type], isRequired: f.required, optionsJson: f.type === 'select' ? (f.options ?? []) : null, sortOrder },
    idempotencyKey,
  })
export const createCustomVersion = (customPolicyId: string, v: { effectiveFrom: string; reason: string; values: Record<string, CustomValue> }, idempotencyKey?: string) =>
  api<CustomVersionRecord>('POST', '/custom-policy-versions', { body: { customPolicyId, effectiveFrom: v.effectiveFrom, reason: v.reason || null, valuesJson: v.values }, idempotencyKey })
