import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import AvailableEquipment from '@/modules/resources/pages/AvailableEquipment'
import { useCore } from '@/modules/core-data'
import * as seed from '@/modules/core-data/data/seed'

// Available equipment: only units marked Available, with their location and project. Example data is fictional.

describe('available equipment', () => {
  let saved: Partial<ReturnType<typeof useCore.getState>> = {}
  beforeEach(() => {
    const s = useCore.getState()
    saved = { units: s.units, sites: s.sites, projects: s.projects }
    const unit = (id: string, code: string, availability: 'Available' | 'In use', chainageId: string) =>
      ({ id, assetCode: code, name: `Machine ${code}`, type: 'Excavator', makeModel: 'EX-200', availability, chainageId, lat: null, lng: null, lastPing: null } as never)
    useCore.setState({
      units: [unit('u1', 'EXC-01', 'Available', 'site-a'), unit('u2', 'EXC-02', 'In use', 'site-a'), unit('u3', 'DMP-07', 'Available', 'site-none')],
      sites: [{ ...seed.SITES[0]!, id: 'site-a', name: 'Camp A', projectId: 'proj-1' }],
      projects: [{ ...seed.PROJECTS[0]!, id: 'proj-1', code: 'NH-44', name: 'Fictional Highway' }],
    })
  })
  afterEach(() => useCore.setState(saved))

  it('lists only available units, with their location and project', () => {
    render(<MemoryRouter><AvailableEquipment /></MemoryRouter>)
    expect(screen.getByText('EXC-01')).toBeInTheDocument()
    expect(screen.getByText('DMP-07')).toBeInTheDocument()
    expect(screen.queryByText('EXC-02')).toBeNull()
    expect(screen.getAllByText('Camp A').length).toBeGreaterThan(0)
    expect(screen.getAllByText('NH-44 · Fictional Highway').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Not assigned to a project').length).toBeGreaterThan(0)
  })
})
