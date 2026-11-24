import { lazy } from 'react'

/** /, /register and /login sit outside the protected shell, so App mounts them directly instead of through ROUTES. */
export const Home = lazy(() => import('./pages/Home'))
export const Register = lazy(() => import('./pages/Register'))
export const Login = lazy(() => import('./pages/Login'))
export const ForgotPassword = lazy(() => import('./pages/ForgotPassword'))
export const ChangePassword = lazy(() => import('./pages/ChangePassword'))
