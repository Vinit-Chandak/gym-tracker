import { cn } from "@/lib/utils";

type SwitchProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Accessible name; the visible label sits beside the switch, not inside it. */
  label: string;
  disabled?: boolean;
};

/**
 * An on/off control that reads as one at a glance, which is the whole reason to prefer it
 * over a "Turn on" button with a sentence saying what the current state is. The tap target
 * is the full 44px square; the track inside it is smaller.
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
      className="flex h-11 w-14 shrink-0 items-center justify-center rounded-control disabled:opacity-50"
    >
      <span
        aria-hidden
        className={cn(
          "relative block h-7 w-12 rounded-full border transition-colors duration-[var(--ov-duration-feedback)]",
          checked ? "border-accent bg-accent" : "border-line-strong bg-surface-raised",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 block size-[1.375rem] rounded-full bg-surface shadow-sm transition-transform duration-[var(--ov-duration-feedback)]",
            checked && "translate-x-5",
          )}
        />
      </span>
    </button>
  );
}
