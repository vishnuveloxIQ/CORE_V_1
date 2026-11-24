import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'react'
import type { GeoShape, LatLng } from '@/modules/core-data'
import { corridorRings } from '../utils/geo'

/** Another fence of the same project, drawn lightly behind the main one. */
export interface GeoMapZone {
  id: string
  label: string
  shape: GeoShape
  center: LatLng | null
  radiusM: number
  points: LatLng[]
  bufferM: number
}

export interface GeoMapProps {
  /** the project's other fences: shown together with the main one, and clicking one selects it */
  others?: GeoMapZone[]
  onOtherSelect?: (id: string) => void
  shape: GeoShape
  center: LatLng | null
  radiusM: number
  points: LatLng[]
  /** Linear: corridor width on each side of the line, in metres */
  bufferM?: number
  /** pins and centre can be dragged, and clicking the map calls onMapClick */
  editable?: boolean
  onMapClick?: (p: LatLng) => void
  onCenterMove?: (p: LatLng) => void
  onPointMove?: (index: number, p: LatLng) => void
  /** right-click a pin to remove it */
  onPointRemove?: (index: number) => void
  /** change this to zoom the map to the fence again */
  fitKey?: string | number
  /** where to look when there is no fence yet */
  fallback?: LatLng
  label: string
  /** pixels, or a CSS length such as "max(520px, calc(100vh - 340px))" */
  height?: number | string
}

const HYDERABAD: LatLng = [17.385, 78.4867]

const pin = (text: string, kind: 'pin' | 'centre') => L.divIcon({
  className: 'geo-pin-wrap',
  html: `<span class="geo-pin ${kind === 'centre' ? 'is-centre' : ''}"><b>${text}</b></span>`,
  iconSize: [28, 28],
  iconAnchor: [14, 28],
})

/** Leaflet map with street and satellite layers, showing a circle or a polygon geo-fence. */
export function GeoMap({ shape, center, radiusM, points, bufferM = 0, others, onOtherSelect, editable, onMapClick, onCenterMove, onPointMove, onPointRemove, fitKey, fallback = HYDERABAD, label, height = 380 }: GeoMapProps) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)
  const othersLayer = useRef<L.LayerGroup | null>(null)
  // latest callbacks, so the map handlers never go stale
  const cb = useRef({ onMapClick, onCenterMove, onPointMove, onPointRemove, onOtherSelect, editable })
  useEffect(() => { cb.current = { onMapClick, onCenterMove, onPointMove, onPointRemove, onOtherSelect, editable } })
  // the latest other fences, read by the zoom so it can include them
  const othersNow = useRef<GeoMapZone[] | undefined>(others)
  useEffect(() => { othersNow.current = others })
  /** zooms to the fence with the latest props */
  const fit = useRef<() => void>(() => undefined)
  /** once the person pans or zooms, resizes stop re-fitting */
  const touched = useRef(false)
  useEffect(() => {
    fit.current = () => {
      const m = map.current
      if (!m) return
      const sized = (box.current?.clientWidth ?? 0) > 0 && (box.current?.clientHeight ?? 0) > 0
      const target: LatLng[] = shape === 'Radius' ? (center ? [center] : []) : points
      // with other fences on the map, zoom so that all of them are in view
      const more = othersNow.current ?? []
      if (more.length && sized) {
        const all = L.latLngBounds([])
        const add = (z: { shape: GeoShape; center: LatLng | null; radiusM: number; points: LatLng[]; bufferM: number }) => {
          if (z.shape === 'Radius') { if (z.center) all.extend(L.latLng(z.center).toBounds(Math.max(z.radiusM, 50) * 2)) }
          else z.points.forEach((p) => all.extend(L.latLng(p)))
        }
        add({ shape, center, radiusM, points, bufferM })
        more.forEach(add)
        if (all.isValid()) return void m.fitBounds(all, { padding: [36, 36], maxZoom: 18 })
      }
      if (!target.length) return void m.setView(fallback, 13)
      if (shape === 'Radius' && center) {
        const b = L.latLng(center).toBounds(Math.max(radiusM, 50) * 2.4)
        return void (sized ? m.fitBounds(b) : m.setView(center, 15))
      }
      if (shape === 'Linear' && sized && target.length >= 2) {
        const b = L.latLngBounds(target)
        return void m.fitBounds(b.extend(L.latLng(b.getNorth(), b.getEast()).toBounds(bufferM * 2)).extend(L.latLng(b.getSouth(), b.getWest()).toBounds(bufferM * 2)), { padding: [36, 36], maxZoom: 18 })
      }
      if (target.length === 1 || !sized) return void m.setView(target[0], 16)
      m.fitBounds(L.latLngBounds(target), { padding: [36, 36], maxZoom: 18 })
    }
  })

  // create the map once
  useEffect(() => {
    if (!box.current) return
    const m = L.map(box.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: true }).setView(fallback, 13)
    const street = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' })
    const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Imagery © Esri' })
    street.addTo(m)
    L.control.layers({ Map: street, Satellite: sat }, undefined, { position: 'topright' }).addTo(m)
    L.control.scale({ imperial: false }).addTo(m)
    // the other fences go in first so the main fence and its pins are drawn above them
    othersLayer.current = L.layerGroup().addTo(m)
    layer.current = L.layerGroup().addTo(m)
    m.on('click', (e: L.LeafletMouseEvent) => { if (cb.current.editable) cb.current.onMapClick?.([+e.latlng.lat.toFixed(6), +e.latlng.lng.toFixed(6)]) })
    map.current = m
    const el = box.current
    const touch = () => { touched.current = true }
    el.addEventListener('pointerdown', touch)
    el.addEventListener('wheel', touch, { passive: true })
    // the card can still be growing (fonts, entrance animation): keep tiles and the fit right until the person moves the map
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { m.invalidateSize(); if (!touched.current) fit.current() }) : null
    ro?.observe(el)
    return () => { ro?.disconnect(); el.removeEventListener('pointerdown', touch); el.removeEventListener('wheel', touch); m.remove(); map.current = null; layer.current = null; othersLayer.current = null }
    // fallback only matters for the first view
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // draw the fence
  useEffect(() => {
    const g = layer.current
    if (!g) return
    g.clearLayers()
    // colours come from CSS (.geo-shape) so light and dark themes both work
    const style = { className: 'geo-shape', weight: 2.5, fillOpacity: 0.18 }
    if (shape === 'Radius' && center) {
      L.circle(center, { ...style, radius: Math.max(radiusM, 1), dashArray: '6 5' }).addTo(g)
      const c = L.marker(center, { icon: pin('●', 'centre'), draggable: !!editable, keyboard: true, title: 'Centre' }).addTo(g)
      c.on('dragend', () => { const p = c.getLatLng(); cb.current.onCenterMove?.([+p.lat.toFixed(6), +p.lng.toFixed(6)]) })
    }
    if (shape === 'Linear' && points.length) {
      // corridor: every segment and pin buffered, filled as one shape (non-zero fill = their union)
      const rings = corridorRings(points, bufferM)
      if (rings.length) L.polygon(rings, { className: 'geo-corridor', stroke: false, fillOpacity: 0.22, fillRule: 'nonzero', interactive: false }).addTo(g)
      if (points.length >= 2) L.polyline(points, { className: 'geo-line', weight: 3, dashArray: '8 6', interactive: false }).addTo(g)
    }
    if ((shape === 'Polygon' || shape === 'Linear') && points.length) {
      if (shape === 'Polygon' && points.length >= 3) L.polygon(points, style).addTo(g)
      else if (shape === 'Polygon' && points.length === 2) L.polyline(points, { ...style, dashArray: '6 5' }).addTo(g)
      points.forEach((p, i) => {
        const mk = L.marker(p, { icon: pin(String(i + 1), 'pin'), draggable: !!editable, keyboard: true, title: `Pin ${i + 1}` }).addTo(g)
        mk.on('dragend', () => { const q = mk.getLatLng(); cb.current.onPointMove?.(i, [+q.lat.toFixed(6), +q.lng.toFixed(6)]) })
        mk.on('contextmenu', () => { if (cb.current.editable) cb.current.onPointRemove?.(i) })
      })
    }
  }, [shape, center, radiusM, points, bufferM, editable])

  // draw the project's other fences: light, labelled on hover, and a click selects one
  useEffect(() => {
    const g = othersLayer.current
    if (!g) return
    g.clearLayers()
    const style = { className: 'geo-other', weight: 2, fillOpacity: 0.1 }
    ;(others ?? []).forEach((z) => {
      const parts: L.Layer[] = []
      if (z.shape === 'Radius' && z.center) parts.push(L.circle(z.center, { ...style, radius: Math.max(z.radiusM, 1) }))
      if (z.shape === 'Polygon' && z.points.length >= 3) parts.push(L.polygon(z.points, style))
      if (z.shape === 'Linear' && z.points.length >= 2) {
        const rings = corridorRings(z.points, z.bufferM)
        if (rings.length) parts.push(L.polygon(rings, { ...style, stroke: false, fillOpacity: 0.14, fillRule: 'nonzero' }))
        parts.push(L.polyline(z.points, { className: 'geo-other-line', weight: 3 }))
      }
      parts.forEach((p) => {
        p.bindTooltip(z.label, { sticky: true })
        p.on('click', (e) => { L.DomEvent.stopPropagation(e); cb.current.onOtherSelect?.(z.id) })
        p.addTo(g)
      })
    })
  }, [others])

  // zoom to the fence when asked (and on first draw); not on every pin move
  useEffect(() => { fit.current() }, [fitKey])

  return (
    <div className={editable ? 'geo-leaflet is-editing' : 'geo-leaflet'} style={{ height }}>
      <div ref={box} className="geo-leaflet-map" role="application" aria-label={label} />
    </div>
  )
}
