import type { Icon as PhosphorIcon, IconProps } from "@phosphor-icons/react/lib";
import { ArrowSquareOutIcon } from "@phosphor-icons/react/dist/ssr/ArrowSquareOut";
import { DownloadSimpleIcon } from "@phosphor-icons/react/dist/ssr/DownloadSimple";
import { EnvelopeOpenIcon } from "@phosphor-icons/react/dist/ssr/EnvelopeOpen";
import { GearSixIcon } from "@phosphor-icons/react/dist/ssr/GearSix";
import { MicrophoneIcon } from "@phosphor-icons/react/dist/ssr/Microphone";
import { MicrophoneSlashIcon } from "@phosphor-icons/react/dist/ssr/MicrophoneSlash";
import { PaperclipIcon } from "@phosphor-icons/react/dist/ssr/Paperclip";
import type { ComponentType, CSSProperties } from "react";

import { cn } from "@/lib/utils";

import { Glyph, type GlyphName } from "./glyphs";

type IconScale = "control" | "navigation" | "row" | "feature";
export type AppIconProps = {
  /** Glyph dimensions only; the surrounding control owns its hit target. */
  scale?: IconScale;
  className?: string;
  style?: CSSProperties;
  "aria-hidden"?: boolean | "true" | "false";
  "aria-label"?: string;
  alt?: string;
};
export type AppIcon = ComponentType<AppIconProps>;

/**
 * Form v2's glyphs (DESIGN.md, Shapes: a 24-unit grid, a 2.0 stroke, round caps, ink only)
 * under the names the screens already use, so every call site takes the new set at once. The
 * glyph is decoration unless it is named.
 */
function glyph(name: GlyphName): AppIcon {
  return function GlyphIcon({
    scale = "control",
    className,
    alt,
    "aria-label": label,
    "aria-hidden": _hidden,
    ...props
  }: AppIconProps) {
    return (
      <Glyph
        name={name}
        label={label ?? alt}
        className={cn("app-icon", className)}
        data-icon-scale={scale}
        {...props}
      />
    );
  };
}

/**
 * The few icons the boards never drew (a microphone, a paperclip, a download, mail, a link out
 * of the app, a gear) keep Phosphor, in its regular weight, which is the nearest to a 2.0
 * stroke: decided with the owner on 3 October 2026.
 */
function phosphor(Icon: PhosphorIcon): AppIcon {
  return function PhosphorGlyph({ scale = "control", className, ...props }: AppIconProps) {
    return (
      <Icon
        aria-hidden={props.alt || props["aria-label"] ? undefined : true}
        focusable="false"
        {...(props as IconProps)}
        weight="regular"
        className={cn("app-icon", className)}
        data-icon-scale={scale}
      />
    );
  };
}

// Functional names stay stable for the shared row, form and navigation components.
export const AiCoach = /* @__PURE__ */ glyph("coach");
export const ArrowRight = /* @__PURE__ */ glyph("arrowRight");
export const ArrowsDownUp = /* @__PURE__ */ glyph("swap");
export const BarChart = /* @__PURE__ */ glyph("progress");
export const BookOpen = /* @__PURE__ */ glyph("book");
export const CalendarDays = /* @__PURE__ */ glyph("calendar");
export const Check = /* @__PURE__ */ glyph("check");
export const CheckCircle2 = /* @__PURE__ */ glyph("check");
export const ChevronDown = /* @__PURE__ */ glyph("chevronDown");
export const ChevronLeft = /* @__PURE__ */ glyph("chevronLeft");
export const ChevronRight = /* @__PURE__ */ glyph("chevronRight");
export const ClipboardList = /* @__PURE__ */ glyph("note");
/** Removing one thing from a group of them, where a bin would say more than is meant. */
export const Close = /* @__PURE__ */ glyph("close");
export const Download = /* @__PURE__ */ phosphor(DownloadSimpleIcon);
export const Dumbbell = /* @__PURE__ */ glyph("dumbbell");
export const ExternalLink = /* @__PURE__ */ phosphor(ArrowSquareOutIcon);
export const Food = /* @__PURE__ */ glyph("food");
export const Footprints = /* @__PURE__ */ glyph("training");
export const Info = /* @__PURE__ */ glyph("info");
export const KeyRound = /* @__PURE__ */ glyph("key");
export const Link2 = /* @__PURE__ */ glyph("link");
/** Waiting on the server: the dial that waits, turning. */
export const LoaderCircle = /* @__PURE__ */ glyph("wait");
export const Lock = /* @__PURE__ */ glyph("lock");
export const LogOut = /* @__PURE__ */ glyph("exit");
export const MailCheck = /* @__PURE__ */ phosphor(EnvelopeOpenIcon);
export const MapPin = /* @__PURE__ */ glyph("pin");
export const Mic = /* @__PURE__ */ phosphor(MicrophoneIcon);
export const MicOff = /* @__PURE__ */ phosphor(MicrophoneSlashIcon);
export const Minus = /* @__PURE__ */ glyph("minus");
export const Paperclip = /* @__PURE__ */ phosphor(PaperclipIcon);
export const Plus = /* @__PURE__ */ glyph("plus");
/** Quick add: a food logged from its figures alone, just this once. */
export const QuickAdd = /* @__PURE__ */ glyph("bolt");
/** Compare: two pans weighed against each other. */
export const Scales = /* @__PURE__ */ glyph("scales");
export const Search = /* @__PURE__ */ glyph("search");
export const Settings = /* @__PURE__ */ phosphor(GearSixIcon);
export const SlidersHorizontal = /* @__PURE__ */ glyph("sliders");
/** A starred meal: one kept for adding again in one tap. */
export const Star = /* @__PURE__ */ glyph("star");
export const SunMoon = /* @__PURE__ */ glyph("contrast");
export const Timer = /* @__PURE__ */ glyph("timer");
export const Trash = /* @__PURE__ */ glyph("trash");
/** Leaderboard: the cup, which needs no explaining. */
export const Trophy = /* @__PURE__ */ glyph("trophy");
export const User = /* @__PURE__ */ glyph("profile");
export const UserPlus = /* @__PURE__ */ glyph("personPlus");
export const Users = /* @__PURE__ */ glyph("people");
