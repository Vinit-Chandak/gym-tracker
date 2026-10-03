type SwitchProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Accessible name; the visible label sits beside the switch, not inside it. */
  label: string;
  disabled?: boolean;
};

/**
 * An on/off control that reads as one at a glance, which is the whole reason to prefer it
 * over a "Turn on" button with a sentence saying what the current state is (boards Profile,
 * Privacy): an ink track with its knob at the end when on, a grey one when off. The target is
 * 44 pt tall; the track inside it is 31.
 */
export function Switch({ checked, onChange, label, disabled }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="switch"
    >
      <span aria-hidden className="switch-track">
        <span className="switch-knob" />
      </span>
    </button>
  );
}
