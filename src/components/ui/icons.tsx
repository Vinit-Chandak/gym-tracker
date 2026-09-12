import type { Icon as PhosphorIcon, IconProps } from "@phosphor-icons/react/lib";
import { ArrowSquareOutIcon } from "@phosphor-icons/react/dist/ssr/ArrowSquareOut";
import { BarbellIcon } from "@phosphor-icons/react/dist/ssr/Barbell";
import { BookOpenIcon } from "@phosphor-icons/react/dist/ssr/BookOpen";
import { BrainIcon } from "@phosphor-icons/react/dist/ssr/Brain";
import { CalendarDotsIcon } from "@phosphor-icons/react/dist/ssr/CalendarDots";
import { ChartLineUpIcon } from "@phosphor-icons/react/dist/ssr/ChartLineUp";
import { CaretDownIcon } from "@phosphor-icons/react/dist/ssr/CaretDown";
import { CaretLeftIcon } from "@phosphor-icons/react/dist/ssr/CaretLeft";
import { CaretRightIcon } from "@phosphor-icons/react/dist/ssr/CaretRight";
import { CheckIcon } from "@phosphor-icons/react/dist/ssr/Check";
import { CheckCircleIcon } from "@phosphor-icons/react/dist/ssr/CheckCircle";
import { CircleHalfIcon } from "@phosphor-icons/react/dist/ssr/CircleHalf";
import { CircleNotchIcon } from "@phosphor-icons/react/dist/ssr/CircleNotch";
import { ClipboardTextIcon } from "@phosphor-icons/react/dist/ssr/ClipboardText";
import { DownloadSimpleIcon } from "@phosphor-icons/react/dist/ssr/DownloadSimple";
import { EnvelopeOpenIcon } from "@phosphor-icons/react/dist/ssr/EnvelopeOpen";
import { GearSixIcon } from "@phosphor-icons/react/dist/ssr/GearSix";
import { InfoIcon } from "@phosphor-icons/react/dist/ssr/Info";
import { KeyIcon } from "@phosphor-icons/react/dist/ssr/Key";
import { LinkIcon } from "@phosphor-icons/react/dist/ssr/Link";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/ssr/MagnifyingGlass";
import { MapPinIcon } from "@phosphor-icons/react/dist/ssr/MapPin";
import { SignOutIcon } from "@phosphor-icons/react/dist/ssr/SignOut";
import { SlidersHorizontalIcon } from "@phosphor-icons/react/dist/ssr/SlidersHorizontal";
import { SneakerMoveIcon } from "@phosphor-icons/react/dist/ssr/SneakerMove";
import { TimerIcon } from "@phosphor-icons/react/dist/ssr/Timer";
import { TrashIcon } from "@phosphor-icons/react/dist/ssr/Trash";
import { UserIcon } from "@phosphor-icons/react/dist/ssr/User";
import type { ComponentType } from "react";

import { cn } from "@/lib/utils";

type IconScale = "control" | "navigation" | "row" | "feature";
export type AppIconProps = Omit<IconProps, "size" | "weight" | "strokeWidth"> & {
  /** Glyph dimensions only; the surrounding control owns its hit target. */
  scale?: IconScale;
};
export type AppIcon = ComponentType<AppIconProps>;

/**
 * One chosen family, using context-free imports in both server and client components.
 * Import individual modules so development never has to compile the entire icon catalog.
 * Phosphor draws filled paths; Lucide's strokeWidth would distort these silhouettes.
 */
function duotone(Icon: PhosphorIcon): AppIcon {
  return function DuotoneIcon({ scale = "control", className, ...props }: AppIconProps) {
    return (
      <Icon
        aria-hidden={
          props.alt || props["aria-label"] || props["aria-labelledby"] ? undefined : true
        }
        focusable="false"
        {...props}
        weight="duotone"
        className={cn("app-icon", className)}
        data-icon-scale={scale}
      />
    );
  };
}

// Keep functional names stable for the shared row, form and navigation components.
export const AiCoach = /* @__PURE__ */ duotone(BrainIcon);
export const BookOpen = /* @__PURE__ */ duotone(BookOpenIcon);
export const CalendarDays = /* @__PURE__ */ duotone(CalendarDotsIcon);
export const Check = /* @__PURE__ */ duotone(CheckIcon);
export const CheckCircle2 = /* @__PURE__ */ duotone(CheckCircleIcon);
export const ChevronDown = /* @__PURE__ */ duotone(CaretDownIcon);
export const ChevronLeft = /* @__PURE__ */ duotone(CaretLeftIcon);
export const ChevronRight = /* @__PURE__ */ duotone(CaretRightIcon);
export const ClipboardList = /* @__PURE__ */ duotone(ClipboardTextIcon);
export const Download = /* @__PURE__ */ duotone(DownloadSimpleIcon);
export const Dumbbell = /* @__PURE__ */ duotone(BarbellIcon);
export const ExternalLink = /* @__PURE__ */ duotone(ArrowSquareOutIcon);
export const Footprints = /* @__PURE__ */ duotone(SneakerMoveIcon);
export const Info = /* @__PURE__ */ duotone(InfoIcon);
export const KeyRound = /* @__PURE__ */ duotone(KeyIcon);
export const Link2 = /* @__PURE__ */ duotone(LinkIcon);
export const LoaderCircle = /* @__PURE__ */ duotone(CircleNotchIcon);
export const LogOut = /* @__PURE__ */ duotone(SignOutIcon);
export const MailCheck = /* @__PURE__ */ duotone(EnvelopeOpenIcon);
export const MapPin = /* @__PURE__ */ duotone(MapPinIcon);
export const Search = /* @__PURE__ */ duotone(MagnifyingGlassIcon);
export const Settings = /* @__PURE__ */ duotone(GearSixIcon);
export const SlidersHorizontal = /* @__PURE__ */ duotone(SlidersHorizontalIcon);
export const SunMoon = /* @__PURE__ */ duotone(CircleHalfIcon);
export const Timer = /* @__PURE__ */ duotone(TimerIcon);
export const Trash = /* @__PURE__ */ duotone(TrashIcon);
/**
 * Progress. A chart with its axes rather than a bare rising arrow: the arrow alone floated
 * in the top of its box, leaving a gap between it and the caption that no other tab had,
 * and said nothing about being a chart.
 */
export const TrendingUp = /* @__PURE__ */ duotone(ChartLineUpIcon);
export const User = /* @__PURE__ */ duotone(UserIcon);
