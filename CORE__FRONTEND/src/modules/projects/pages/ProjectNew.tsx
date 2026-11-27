import { useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { PageHead } from '@/modules/shell'
import { useEnter } from '@/shared/hooks/useMotion'
import { notify } from '@/shared/lib/toast'
import { ProjectForm } from '../components/ProjectForm'

export default function ProjectNew() {
  const ref = useRef<HTMLDivElement>(null)
  useEnter(ref, 'project-new')
  const navigate = useNavigate()
  return (
    <div ref={ref}>
      <PageHead crumb="New project" title="New project" desc="Fields marked with * are required. Add milestones after saving."
        actions={<Button icon="chevL" onClick={() => navigate('/projects')}>Back to projects</Button>} />
      <Card className="max-w-[920px]" title="Project details">
        <ProjectForm onCancel={() => navigate('/projects')} onSaved={(id) => { notify('Project created'); navigate(`/projects/${id}`) }} />
      </Card>
    </div>
  )
}
