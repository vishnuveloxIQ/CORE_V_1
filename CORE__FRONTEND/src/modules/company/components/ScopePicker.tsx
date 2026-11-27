import type { Project } from '@/modules/core-data'

/** Where a policy or rate applies: the whole company, or only the chosen projects. */
export interface ScopeValue { mode: 'company' | 'projects'; projectIds: string[] }

/** The store's form of a scope: null for the whole company, otherwise the chosen project ids. */
export const scopeIds = (v: ScopeValue): string[] | null => (v.mode === 'company' ? null : v.projectIds);

/** A short label for a scope, for headings and tables. */
export const scopeLabel = (projectId: string | null | undefined, projects: Project[]) =>
  projectId ? projects.find((p) => p.id === projectId)?.name ?? 'Selected project' : 'Whole company';

/**
 * Chooses the scope of a save: the whole company, or any number of projects. The same content is saved once for each
 * chosen project, so one file can serve several projects.
 */
export function ScopePicker({ value, onChange, projects }: { value: ScopeValue; onChange: (v: ScopeValue) => void; projects: Project[] }) {
  const toggle = (id: string) =>
    onChange({ ...value, projectIds: value.projectIds.includes(id) ? value.projectIds.filter((x) => x !== id) : [...value.projectIds, id] });
  return (
    <div style={{ marginBottom: 18 }}>
      <div className="radio-cards" role="radiogroup" aria-label="Scope">
        <label className="radio-card">
          <input type="radio" name="scope" checked={value.mode === 'company'} onChange={() => onChange({ ...value, mode: 'company' })} />
          <div><strong>Whole company</strong><span>Applies to every project</span></div>
        </label>
        <label className="radio-card">
          <input type="radio" name="scope" checked={value.mode === 'projects'} onChange={() => onChange({ ...value, mode: 'projects' })} />
          <div><strong>Selected projects</strong><span>Applies only to the projects you choose</span></div>
        </label>
      </div>
      {value.mode === 'projects' && (
        <div style={{ marginTop: 12 }}>
          {projects.length === 0 ? (
            <span className="helper">No projects on the server yet.</span>
          ) : (
            <div className="check-grid">
              {projects.map((p) => (
                <label key={p.id} className="check-row">
                  <input type="checkbox" checked={value.projectIds.includes(p.id)} onChange={() => toggle(p.id)} />
                  <span>{p.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
