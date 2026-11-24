import type { LatLng } from '@/modules/core-data'

const R = 6_371_008.8 // mean Earth radius, metres
const rad = (d: number) => (d * Math.PI) / 180

/** Middle of a set of points (fine for site-sized areas). */
export function centroid(points: LatLng[]): LatLng {
  if (!points.length) return [0, 0]
  const [la, ln] = points.reduce(([a, b], [x, y]) => [a + x, b + y], [0, 0])
  return [la / points.length, ln / points.length]
}

/** Great-circle distance in metres. */
export function distanceM([la1, ln1]: LatLng, [la2, ln2]: LatLng) {
  const a = Math.sin(rad(la2 - la1) / 2) ** 2 + Math.cos(rad(la1)) * Math.cos(rad(la2)) * Math.sin(rad(ln2 - ln1) / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

/** Local flat projection around the centroid, in metres. */
function project(points: LatLng[]) {
  const [lat0] = centroid(points)
  return points.map(([la, ln]) => [R * rad(ln) * Math.cos(rad(lat0)), R * rad(la)] as const)
}

/** Polygon area in square metres (shoelace on a local projection). */
export function polygonAreaM2(points: LatLng[]) {
  if (points.length < 3) return 0
  const p = project(points)
  let sum = 0
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i]; const [x2, y2] = p[(i + 1) % p.length]
    sum += x1 * y2 - x2 * y1
  }
  return Math.abs(sum) / 2
}

export function perimeterM(points: LatLng[]) {
  return points.reduce((s, p, i) => (points.length < 2 ? 0 : s + distanceM(p, points[(i + 1) % points.length])), 0)
}

/** True when two non-adjacent edges cross, i.e. the boundary folds over itself. */
export function selfIntersects(points: LatLng[]) {
  const n = points.length
  if (n < 4) return false
  const p = project(points)
  const cross = (a: readonly number[], b: readonly number[], c: readonly number[]) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
  const hits = (a: readonly number[], b: readonly number[], c: readonly number[], d: readonly number[]) =>
    cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(i - j) <= 1 || (i === 0 && j === n - 1)) continue
      if (hits(p[i], p[(i + 1) % n], p[j], p[(j + 1) % n])) return true
    }
  }
  return false
}

/** "17.4031, 78.5570" per line → points, with the line numbers that could not be read. */
export function parsePoints(text: string) {
  const points: LatLng[] = []
  const bad: number[] = []
  text.split(/\r?\n/).forEach((line, i) => {
    const t = line.trim()
    if (!t) return
    const m = t.split(/[,;\s]+/).filter(Boolean).map(Number)
    if (m.length === 2 && m.every(Number.isFinite) && Math.abs(m[0]) <= 90 && Math.abs(m[1]) <= 180) points.push([m[0], m[1]])
    else bad.push(i + 1)
  })
  return { points, bad }
}

export const fmtCoord = ([la, ln]: LatLng) => `${la.toFixed(5)}, ${ln.toFixed(5)}`

/** "1.2 ha" / "850 m²" */
export function fmtArea(m2: number) {
  if (m2 >= 10_000) return `${(m2 / 10_000).toLocaleString('en-IN', { maximumFractionDigits: 2 })} ha`
  return `${Math.round(m2).toLocaleString('en-IN')} m²`
}

export const fmtDistance = (m: number) => (m >= 1000 ? `${(m / 1000).toLocaleString('en-IN', { maximumFractionDigits: 2 })} km` : `${Math.round(m)} m`)

export const SHAPE_LABEL = { Radius: 'Circle', Polygon: 'Polygon', Linear: 'Linear' } as const

/** Length of an open line (Linear centre line) in metres. */
export function lineLengthM(points: LatLng[]) {
  let m = 0
  for (let i = 1; i < points.length; i++) m += distanceM(points[i - 1], points[i])
  return m
}

/** Area of a corridor: each side of the line by bufferM, with round ends. */
export const corridorAreaM2 = (points: LatLng[], bufferM: number) => (points.length < 2 ? 0 : lineLengthM(points) * 2 * bufferM + Math.PI * bufferM ** 2)

/**
 * The corridor as rings (one rectangle per segment, one circle per pin), all wound the same way so that
 * drawing them as one shape with a non-zero fill gives their union.
 */
export function corridorRings(points: LatLng[], bufferM: number): LatLng[][] {
  if (points.length < 2 || !(bufferM > 0)) return []
  const [lat0, lng0] = centroid(points)
  const kx = R * rad(1) * Math.cos(rad(lat0))
  const ky = R * rad(1)
  const toXY = ([la, ln]: LatLng) => [(ln - lng0) * kx, (la - lat0) * ky] as const
  const toLL = (x: number, y: number): LatLng => [lat0 + y / ky, lng0 + x / kx]
  const ccw = (ring: (readonly [number, number])[]) => {
    let a = 0
    for (let i = 0; i < ring.length; i++) { const [x1, y1] = ring[i]; const [x2, y2] = ring[(i + 1) % ring.length]; a += x1 * y2 - x2 * y1 }
    return a < 0 ? [...ring].reverse() : ring
  }
  const xy = points.map(toXY)
  const rings: (readonly [number, number])[][] = []
  for (let i = 1; i < xy.length; i++) {
    const [x1, y1] = xy[i - 1]; const [x2, y2] = xy[i]
    const len = Math.hypot(x2 - x1, y2 - y1) || 1
    const nx = (-(y2 - y1) / len) * bufferM; const ny = ((x2 - x1) / len) * bufferM
    rings.push(ccw([[x1 + nx, y1 + ny], [x2 + nx, y2 + ny], [x2 - nx, y2 - ny], [x1 - nx, y1 - ny]]))
  }
  for (const [x, y] of xy) rings.push(ccw(Array.from({ length: 24 }, (_, k) => [x + bufferM * Math.cos((k / 24) * 2 * Math.PI), y + bufferM * Math.sin((k / 24) * 2 * Math.PI)] as const)))
  return rings.map((r) => r.map(([x, y]) => toLL(x, y)))
}
