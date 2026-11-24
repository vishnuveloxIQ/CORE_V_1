/** Public API of the shell module. Other modules and app import only from here. */
export { ThemeSwitch } from './components/Header'
export { PageHead } from './components/PageHead'
export { Shell } from './components/Shell'
export { APP } from './config/app'
export { NAV, NOTIFICATIONS, navFor, privilegeFor } from './config/nav'
export { useDocumentTheme } from './hooks/useDocumentTheme'
export { ActionScope } from './components/ActionScope'
