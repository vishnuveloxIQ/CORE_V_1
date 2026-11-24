import { Link } from 'react-router-dom'
import { Card } from '@/shared/ui/Card'
import { EmptyState } from '@/shared/ui/EmptyState'

/** Shown instead of a page the signed-in user's privileges cannot open. The server refuses the data in any case. */
export default function NoAccess() {
  return (
    <Card>
      <EmptyState icon="shield" title="You do not have access to this page">
        Your account does not hold the privilege this page needs. Ask a tenant administrator if you think you should.
      </EmptyState>
      <div style={{ textAlign: 'center', paddingBottom: 8 }}><Link className="btn primary" to="/dashboard">Back to dashboard</Link></div>
    </Card>
  )
}
