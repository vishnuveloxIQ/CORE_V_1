import { Navigate } from 'react-router-dom'

/** The sign-in history moved into the audit trail as a tab; the old /audit/access address opens that tab. */
export default function SignInRedirect() {
  return <Navigate to="/audit?view=sign-in" replace />
}
