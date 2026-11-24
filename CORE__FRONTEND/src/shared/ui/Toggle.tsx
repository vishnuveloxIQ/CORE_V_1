import type { CSSProperties } from 'react'

export interface ToggleProps {
  checked: boolean
  onChange: () => void
  /** Accessible name, e.g. "Overtime policy". */
  label: string
  disabled?: boolean
  /** Text shown beside the switch, e.g. "On" / "Off". */
  stateText?: string
}

/** On/off switch with role="switch" for screen readers. */
export function Toggle({ checked, onChange, label, disabled, stateText }: ToggleProps) {
  const track: CSSProperties = {
    position: 'relative',
    width: 44,
    height: 24,
    borderRadius: 99,
    border: 0,
    padding: 0,
    flex: 'none',
    background: checked ? 'var(--grad-btn)' : 'var(--line-2)',
    boxShadow: checked ? 'var(--glow)' : 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: 'background .2s',
  }
  const knob: CSSProperties = {
    position: 'absolute',
    top: 3,
    left: 3,
    width: 18,
    height: 18,
    borderRadius: '50%',
    background: '#fff',
    boxShadow: '0 1px 4px rgba(10,20,60,.25)',
    transform: checked ? 'translateX(20px)' : 'translateX(0)',
    transition: 'transform .2s',
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={onChange}
        style={track}
      >
        <span aria-hidden="true" style={knob} />
      </button>
      {stateText && <strong style={{ fontSize: 13 }}>{stateText}</strong>}
    </span>
  )
}
