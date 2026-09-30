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
          "relative block h-[1.875rem] w-[3.125rem] rounded-full transition-colors duration-[var(--ov-duration-feedback)]",
          checked ? "bg-accent" : "bg-ink-ghost/45",
        )}
      >
        <span
          className={cn(
            "absolute top-[0.1875rem] left-[0.1875rem] block size-6 rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.25)] transition-transform duration-[var(--ov-duration-feedback)] ease-[var(--ov-ease-out)]",
            checked && "translate-x-5",
          )}
        />
      </span>
    </button>
  );
}
