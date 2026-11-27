import { create } from 'zustand'
import { approvedPeopleApi as approvedApi, useCore, type ApprovedPersonDraft, type ApprovedPersonRecord } from '@/modules/core-data'
import { errorText } from '@/shared/lib/api'
import { notify } from '@/shared/lib/toast'

/** Approved → sent to HRMS → onboarded by HRMS. Read from and written to /approved-people. */
export type ApprovedStatus = 'Approved' | 'With HRMS' | 'Onboarded'

export interface ApprovedPerson {
  id: string
  /** the project's ID (its code), which is stable across reloads */
  projectCode: string
  /** the department the person works in */
  department: string
  name: string
  designation: string
  joiningDate: string
  status: ApprovedStatus
  /** why the person is not onboarded yet, as the HR admin gave it (at most REASON_WORD_LIMIT words) */
  reason?: string
  /** when the admin asked the HR admin for the reason (ISO date-time) */
  reasonRequestedAt?: string
  /** the row version a PATCH must send back */
  rowVersion?: number
}

/** The reason for a person who is not onboarded yet may be at most this many words. */
export const REASON_WORD_LIMIT = 50

/** Number of words in a text (a run of non-space characters is one word). */
export const wordCount = (text: string) => (text.trim() === '' ? 0 : text.trim().split(/\s+/).length)

type Details = Omit<ApprovedPerson, 'id' | 'status' | 'rowVersion' | 'reason' | 'reasonRequestedAt'>

interface ApprovedPeopleState {
  people: ApprovedPerson[]
  /** false until the first read has finished */
  loaded: boolean
  /** why the last read failed, or '' */
  loadError: string
  load: () => Promise<void>
  add: (p: Details) => Promise<void>
  /** records that the admin has asked the HR admin for the reason this person is not onboarded yet */
  requestReason: (id: string) => Promise<void>
  /** changes the details of a person; the status is kept */
  update: (id: string, p: Details) => Promise<void>
  remove: (id: string) => Promise<void>
  sendToHrms: (id: string) => Promise<void>
  markOnboarded: (id: string) => Promise<void>
}

const projectIdOf = (code: string) => useCore.getState().projects.find((p) => p.code === code)?.id
const codeOf = (id: string) => useCore.getState().projects.find((p) => p.id === id)?.code ?? ''

const from = (r: ApprovedPersonRecord): ApprovedPerson => ({
  id: r.id,
  projectCode: codeOf(r.projectId),
  department: r.department,
  name: r.name,
  designation: r.designation,
  joiningDate: r.joiningDate,
  status: r.status,
  reason: r.reason ?? undefined,
  reasonRequestedAt: r.reasonRequestedAt ?? undefined,
  rowVersion: r.rowVersion,
})

const draft = (p: Details): ApprovedPersonDraft => {
  const projectId = projectIdOf(p.projectCode)
  if (!projectId) throw new Error(`Project ${p.projectCode} was not found.`)
  return { projectId, department: p.department, name: p.name, designation: p.designation, joiningDate: p.joiningDate }
}

export const useApprovedPeople = create<ApprovedPeopleState>()((set, get) => {
  /** Runs a write; when it fails, says why and reads the list again so the screen matches the server. */
  const write = async (fn: () => Promise<void>) => {
    try {
      await fn()
    } catch (err) {
      notify(errorText(err))
      await get().load()
    }
  }
  const patch = (id: string, change: Parameters<typeof approvedApi.updateApprovedPerson>[2]) =>
    write(async () => {
      const row = get().people.find((p) => p.id === id)
      if (!row?.rowVersion) return
      const saved = await approvedApi.updateApprovedPerson(id, row.rowVersion, change)
      set((s) => ({ people: s.people.map((p) => (p.id === id ? from(saved) : p)) }))
    })

  return {
    people: [],
    loaded: false,
    loadError: '',
    load: async () => {
      try {
        const list = await approvedApi.listApprovedPeople()
        set({ people: list.map(from), loaded: true, loadError: '' })
      } catch (err) {
        set({ loaded: true, loadError: errorText(err) })
      }
    },
    add: (p) =>
      write(async () => {
        const saved = await approvedApi.createApprovedPerson(draft(p))
        set((s) => ({ people: [...s.people, from(saved)] }))
      }),
    requestReason: (id) => patch(id, { reasonRequestedAt: new Date().toISOString() }),
    update: (id, p) => patch(id, draft(p)),
    remove: (id) =>
      write(async () => {
        await approvedApi.deleteApprovedPerson(id)
        set((s) => ({ people: s.people.filter((x) => x.id !== id) }))
      }),
    sendToHrms: (id) => (get().people.find((p) => p.id === id)?.status === 'Approved' ? patch(id, { status: 'With HRMS' }) : Promise.resolve()),
    markOnboarded: (id) => (get().people.find((p) => p.id === id)?.status === 'With HRMS' ? patch(id, { status: 'Onboarded' }) : Promise.resolve()),
  }
})
