import { Card } from '@/shared/ui/Card'
import { EmptyState } from '@/shared/ui/EmptyState'
import { Button } from '@/shared/ui/Button'
import { useAuth } from '@/modules/auth'

/**
 * Shown to a signed-in user who is not an administrator. Company setup, users and privileges belong to administrators;
 * a module head or approver uses the screens of their own module, which are not part of this application.
 */
export default function ModuleHome() {
  const logout = useAuth((s) => s.logout)
  // no sidebar or menu: only the message and sign-out
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div style={{ width: 'min(520px, 100%)' }}>
        <Card>
          <EmptyState icon="shield" title="Your module screens are not in this application">
            Company setup, users and privileges are managed by a tenant administrator. Open the screens of your own module,
            or ask an administrator if you need something else.
          </EmptyState>
          <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: 8 }}>
            <Button onClick={() => void logout()}>Sign out</Button>
          </div>
        </Card>
      </div>
    </main>
  )
}
