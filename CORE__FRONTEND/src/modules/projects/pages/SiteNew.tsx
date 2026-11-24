import { useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { PageHead } from '@/modules/shell'
import { useEnter } from '@/shared/hooks/useMotion'
import { notify } from '@/shared/lib/toast'
import { useCore } from '@/modules/core-data'
import { SiteForm } from '../components/SiteForm'

export default function SiteNew() {
  const ref = useRef<HTMLDivElement>(null)
  useEnter(ref, 'site-new')
  const navigate = useNavigate()
  // opened from a project's Locations tab with ?projectId=: that project is chosen already, and the user returns to it
  const [params] = useSearchParams()
  const fromProject = useCore((s) => s.projects.find((p) => p.id === params.get('projectId')))
  const projectPage = fromProject ? `/projects/${fromProject.id}?tab=Locations` : null
  return (
    <div ref={ref}>
      <PageHead crumb="New location" title="New location" desc="Fields marked with * are required."
        actions={projectPage
          ? <Button icon="chevL" onClick={() => navigate(projectPage)}>Back to project</Button>
          : <Button icon="chevL" onClick={() => navigate('/sites')}>Back to locations</Button>} />
      <Card className="max-w-[920px]" title="Location details">
        <SiteForm
          defaultProjectId={fromProject?.id}
          onCancel={() => (projectPage ? navigate(projectPage) : navigate(-1))}
          onSaved={(id) => { notify('Location created'); navigate(projectPage ?? `/sites/${id}`) }} />
      </Card>
    </div>
  )
}
