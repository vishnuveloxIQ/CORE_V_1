/** Public API of the auth module. Other modules and app import only from here. */
export { onSignedOut, useAuth } from './store/useAuth'
export { ADMIN_PRIVILEGE } from './store/useAuth'
export { Can, MANAGE, useCanManage } from './access'
export { lastLoginRole, rememberLoginRole } from './utils/loginRole'
export { loginPrefixFor, matchesCompanyPrefix, withCompanyPrefix } from './utils/tenants'
