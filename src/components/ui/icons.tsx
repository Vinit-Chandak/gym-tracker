import type { Icon as PhosphorIcon, IconProps } from "@phosphor-icons/react/lib";
import { ArrowClockwiseIcon } from "@phosphor-icons/react/dist/ssr/ArrowClockwise";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/ssr/ArrowRight";
import { ArrowsDownUpIcon } from "@phosphor-icons/react/dist/ssr/ArrowsDownUp";
import { ArrowSquareOutIcon } from "@phosphor-icons/react/dist/ssr/ArrowSquareOut";
import { BarbellIcon } from "@phosphor-icons/react/dist/ssr/Barbell";
import { BookOpenIcon } from "@phosphor-icons/react/dist/ssr/BookOpen";
import { BowlFoodIcon } from "@phosphor-icons/react/dist/ssr/BowlFood";
import { BrainIcon } from "@phosphor-icons/react/dist/ssr/Brain";
import { CalendarDotsIcon } from "@phosphor-icons/react/dist/ssr/CalendarDots";
import { ChartBarIcon } from "@phosphor-icons/react/dist/ssr/ChartBar";
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
import { HouseIcon } from "@phosphor-icons/react/dist/ssr/House";
import { InfoIcon } from "@phosphor-icons/react/dist/ssr/Info";
import { KeyIcon } from "@phosphor-icons/react/dist/ssr/Key";
import { LightningIcon } from "@phosphor-icons/react/dist/ssr/Lightning";
import { LinkIcon } from "@phosphor-icons/react/dist/ssr/Link";
import { LockSimpleIcon } from "@phosphor-icons/react/dist/ssr/LockSimple";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/ssr/MagnifyingGlass";
import { MapPinIcon } from "@phosphor-icons/react/dist/ssr/MapPin";
import { MicrophoneIcon } from "@phosphor-icons/react/dist/ssr/Microphone";
import { MicrophoneSlashIcon } from "@phosphor-icons/react/dist/ssr/MicrophoneSlash";
import { MinusIcon } from "@phosphor-icons/react/dist/ssr/Minus";
import { MoonIcon } from "@phosphor-icons/react/dist/ssr/Moon";
import { PaperclipIcon } from "@phosphor-icons/react/dist/ssr/Paperclip";
import { PersonSimpleBikeIcon } from "@phosphor-icons/react/dist/ssr/PersonSimpleBike";
import { PersonSimpleRunIcon } from "@phosphor-icons/react/dist/ssr/PersonSimpleRun";
import { PersonSimpleSwimIcon } from "@phosphor-icons/react/dist/ssr/PersonSimpleSwim";
import { PlusIcon } from "@phosphor-icons/react/dist/ssr/Plus";
import { ScalesIcon } from "@phosphor-icons/react/dist/ssr/Scales";
import { SignOutIcon } from "@phosphor-icons/react/dist/ssr/SignOut";
import { SlidersHorizontalIcon } from "@phosphor-icons/react/dist/ssr/SlidersHorizontal";
import { SneakerMoveIcon } from "@phosphor-icons/react/dist/ssr/SneakerMove";
import { StarIcon } from "@phosphor-icons/react/dist/ssr/Star";
import { TimerIcon } from "@phosphor-icons/react/dist/ssr/Timer";
import { TrashIcon } from "@phosphor-icons/react/dist/ssr/Trash";
import { TreeIcon } from "@phosphor-icons/react/dist/ssr/Tree";
import { TrophyIcon } from "@phosphor-icons/react/dist/ssr/Trophy";
import { UserIcon } from "@phosphor-icons/react/dist/ssr/User";
import { UserPlusIcon } from "@phosphor-icons/react/dist/ssr/UserPlus";
import { UsersIcon } from "@phosphor-icons/react/dist/ssr/Users";
import { XIcon } from "@phosphor-icons/react/dist/ssr/X";
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

/**
 * Chevrons, ticks, plus, minus and the close cross are strokes with nothing to fill: the
 * duotone caret shades the triangle between its arms and the duotone tick sits in a shaded
 * square, so both read as other symbols.
 */
function bold(Icon: PhosphorIcon): AppIcon {
  return function BoldIcon({ scale = "control", className, ...props }: AppIconProps) {
    return (
      <Icon
        aria-hidden={
          props.alt || props["aria-label"] || props["aria-labelledby"] ? undefined : true
        }
        focusable="false"
        {...props}
        weight="bold"
        className={cn("app-icon", className)}
        data-icon-scale={scale}
      />
    );
  };
}

// Keep functional names stable for the shared row, form and navigation components.
export const AiCoach = /* @__PURE__ */ duotone(BrainIcon);
export const ArrowRight = /* @__PURE__ */ duotone(ArrowRightIcon);
export const ArrowsDownUp = /* @__PURE__ */ duotone(ArrowsDownUpIcon);
/**
 * Progress. Bars, after a rising arrow and then a line chart in a frame.
 *
 * At the size the navigation draws it, a hairline is the whole problem: the arrow alone
 * floated in the top of its box, and the framed line spent most of its ink on axes that read
 * as a box rather than as a chart, leaving the tab visibly lighter than the glyphs beside it.
 * Bars are filled shapes, so they survive 26px, and the direction is in the silhouette
 * instead of in an arrowhead three pixels wide.
 */
export const BarChart = /* @__PURE__ */ duotone(ChartBarIcon);
export const BookOpen = /* @__PURE__ */ duotone(BookOpenIcon);
export const CalendarDays = /* @__PURE__ */ duotone(CalendarDotsIcon);
export const Check = /* @__PURE__ */ bold(CheckIcon);
export const CheckCircle2 = /* @__PURE__ */ duotone(CheckCircleIcon);
export const ChevronDown = /* @__PURE__ */ bold(CaretDownIcon);
export const ChevronLeft = /* @__PURE__ */ bold(CaretLeftIcon);
export const ChevronRight = /* @__PURE__ */ bold(CaretRightIcon);
export const ClipboardList = /* @__PURE__ */ duotone(ClipboardTextIcon);
/** Removing one thing from a group of them, where a bin would say more than is meant. */
export const Close = /* @__PURE__ */ bold(XIcon);
export const Download = /* @__PURE__ */ duotone(DownloadSimpleIcon);
export const Dumbbell = /* @__PURE__ */ duotone(BarbellIcon);
export const ExternalLink = /* @__PURE__ */ duotone(ArrowSquareOutIcon);
/**
 * Food: a filled bowl. A fork and knife says food as plainly, but it is drawn in hairlines that
 * fade beside the barbell and the shoe at the navigation's size; the bowl is a filled shape, like
 * the bars two tabs along, and says nothing about which meal it is.
 */
export const Food = /* @__PURE__ */ duotone(BowlFoodIcon);
export const Footprints = /* @__PURE__ */ duotone(SneakerMoveIcon);
/** A home gym. */
export const Home = /* @__PURE__ */ duotone(HouseIcon);
export const Info = /* @__PURE__ */ duotone(InfoIcon);
export const KeyRound = /* @__PURE__ */ duotone(KeyIcon);
export const Link2 = /* @__PURE__ */ duotone(LinkIcon);
export const LoaderCircle = /* @__PURE__ */ duotone(CircleNotchIcon);
export const Lock = /* @__PURE__ */ duotone(LockSimpleIcon);
export const LogOut = /* @__PURE__ */ duotone(SignOutIcon);
export const MailCheck = /* @__PURE__ */ duotone(EnvelopeOpenIcon);
export const MapPin = /* @__PURE__ */ duotone(MapPinIcon);
export const Mic = /* @__PURE__ */ duotone(MicrophoneIcon);
export const MicOff = /* @__PURE__ */ duotone(MicrophoneSlashIcon);
export const Minus = /* @__PURE__ */ bold(MinusIcon);
export const Paperclip = /* @__PURE__ */ duotone(PaperclipIcon);
export const Plus = /* @__PURE__ */ bold(PlusIcon);
/** Try a failed save again. */
export const Retry = /* @__PURE__ */ bold(ArrowClockwiseIcon);
/** A rest day: the one day the programme asks for nothing but recovery. */
export const Rest = /* @__PURE__ */ duotone(MoonIcon);
/** Cycling, drawn as the rider rather than the bike, like running and swimming beside it. */
export const Ride = /* @__PURE__ */ duotone(PersonSimpleBikeIcon);
export const Run = /* @__PURE__ */ duotone(PersonSimpleRunIcon);
export const Swim = /* @__PURE__ */ duotone(PersonSimpleSwimIcon);
/** Quick add: a food logged from its figures alone, just this once. */
export const QuickAdd = /* @__PURE__ */ duotone(LightningIcon);
/** Compare: two pans weighed against each other. */
export const Scales = /* @__PURE__ */ duotone(ScalesIcon);
export const Search = /* @__PURE__ */ duotone(MagnifyingGlassIcon);
export const Settings = /* @__PURE__ */ duotone(GearSixIcon);
export const SlidersHorizontal = /* @__PURE__ */ duotone(SlidersHorizontalIcon);
/** A starred meal: one kept for adding again in one tap. */
export const Star = /* @__PURE__ */ duotone(StarIcon);
export const SunMoon = /* @__PURE__ */ duotone(CircleHalfIcon);
export const Timer = /* @__PURE__ */ duotone(TimerIcon);
export const Trash = /* @__PURE__ */ duotone(TrashIcon);
/** Training outdoors: a park, a track, a hill. */
export const Outdoors = /* @__PURE__ */ duotone(TreeIcon);
/** Leaderboard: the cup, which needs no explaining. */
export const Trophy = /* @__PURE__ */ duotone(TrophyIcon);
export const User = /* @__PURE__ */ duotone(UserIcon);
export const UserPlus = /* @__PURE__ */ duotone(UserPlusIcon);
export const Users = /* @__PURE__ */ duotone(UsersIcon);
