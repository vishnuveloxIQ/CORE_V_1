import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

// No server in tests: every API call fails as offline unless a test mocks fetch itself.
// Screens wired to the API then keep their empty lists, as they do when the server is down.
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('No server in tests'))))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
// jsdom lacks these browser APIs
globalThis.ResizeObserver = globalThis.ResizeObserver ?? (RO as unknown as typeof ResizeObserver)
window.matchMedia =
  window.matchMedia ??
  ((q: string) =>
    ({ matches: false, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }) as MediaQueryList)
window.scrollTo = (() => {}) as typeof window.scrollTo
HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement['getContext']
// Web Animations API (used by the table row animation) — a finished no-op animation
if (!Element.prototype.animate) {
  Element.prototype.animate = function animate() {
    const a = { finished: Promise.resolve(), onfinish: null as null | (() => void), cancel() {}, finish() {}, play() {}, pause() {}, addEventListener() {}, removeEventListener() {} }
    queueMicrotask(() => a.onfinish?.())
    return a as unknown as Animation
  }
}
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? function scrollIntoView() {}
