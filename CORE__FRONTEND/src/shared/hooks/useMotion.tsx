/* eslint-disable react-refresh/only-export-components */
import { useRef, type RefObject } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { useReducedMotion } from './useMedia'

gsap.registerPlugin(useGSAP)

/** Staggered entrance for every `[data-enter]` element inside the scope — re-runs when `key` changes. */
export function useEnter(scope: RefObject<HTMLElement | null>, key: string) {
  const reduced = useReducedMotion()
  useGSAP(
    () => {
      const els = scope.current?.querySelectorAll('[data-enter]')
      if (reduced || !els?.length) return
      gsap.fromTo(
        els,
        { y: 16, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.5, ease: 'power3.out', stagger: 0.055, clearProps: 'transform,opacity' },
      )
    },
    { scope, dependencies: [key, reduced], revertOnUpdate: true },
  )
}

const formatLike = (sample: string, n: number) => {
  const decimals = sample.includes('.') ? sample.split('.')[1].length : 0
  const grouped = sample.includes(',')
  return n.toLocaleString(grouped ? 'en-IN' : 'en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: grouped })
}

/** Counts a number up inside a string like "₹1,49,200" or "16". Always ends on the exact original text. */
export function AnimatedValue({ value, className }: { value: string | number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const reduced = useReducedMotion()
  const text = String(value)
  useGSAP(
    () => {
      const el = ref.current
      if (!el) return
      const m = text.match(/\d[\d,]*(\.\d+)?/)
      if (!m || reduced) { el.textContent = text; return }
      const target = parseFloat(m[0].replace(/,/g, ''))
      const state = { v: 0 }
      el.textContent = text.replace(m[0], formatLike(m[0], 0))
      gsap.to(state, {
        v: target, duration: 1.1, ease: 'power2.out',
        onUpdate: () => { el.textContent = text.replace(m[0], formatLike(m[0], state.v)) },
        onComplete: () => { el.textContent = text },
      })
    },
    { dependencies: [text, reduced], revertOnUpdate: true },
  )
  return <span ref={ref} className={className} aria-label={text}>{text}</span>
}
