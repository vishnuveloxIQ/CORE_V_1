import { Link } from 'react-router-dom'
import { Card } from '@/shared/ui/Card'
import { EmptyState } from '@/shared/ui/EmptyState'

export default function NotFound() {
  return (
    <Card>
      <EmptyState icon="notFound" title="Page not found">That address doesn’t exist in this module.</EmptyState>
      <div style={{ textAlign: 'center', paddingBottom: 8 }}><Link className="btn primary" to="/dashboard">Back to dashboard</Link></div>
    </Card>
  )
}
