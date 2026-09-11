import type { Metadata } from "next";

import { AppearanceRow } from "@/components/shell/appearance-row";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import Link from "@/components/ui/app-link";
import {
  AiCoach,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Download,
  Dumbbell,
  ExternalLink,
  Footprints,
  Info,
  KeyRound,
  Link2,
  LoaderCircle,
  LogOut,
  MailCheck,
  MapPin,
  Search,
  Settings,
  SlidersHorizontal,
  SunMoon,
  Timer,
  Trash,
  TrendingUp,
  User,
  type AppIcon,
} from "@/components/ui/icons";
import { LinkRow, List, PRESSABLE_ROW_CLASS } from "@/components/ui/link-row";
import { Section } from "@/components/ui/section";

import { PreviewShell } from "../../preview-shell";
import { PreviewRestTimer } from "./preview-controls";

export const metadata: Metadata = { title: "Preview · Phosphor icons" };

const SYMBOLS: readonly [string, AppIcon][] = [
  ["Today", Dumbbell],
  ["Runs", Footprints],
  ["History", CalendarDays],
  ["Progress", TrendingUp],
  ["Settings", Settings],
  ["Profile", User],
  ["Programme", ClipboardList],
  ["Gyms", MapPin],
  ["Library", BookOpen],
  ["Rest timer", Timer],
  ["AI coach", AiCoach],
  ["Appearance", SunMoon],
  ["Password", KeyRound],
  ["Coach access", Link2],
  ["Install", Download],
  ["Sign out", LogOut],
  ["Delete", Trash],
  ["Forward", ChevronRight],
  ["Back", ChevronLeft],
  ["Expand", ChevronDown],
  ["Saved", Check],
  ["Success", CheckCircle2],
  ["Information", Info],
  ["Search", Search],
  ["Filters", SlidersHorizontal],
  ["External link", ExternalLink],
  ["Loading", LoaderCircle],
  ["Email confirmation", MailCheck],
];

/** Production components with sample content; the parent layout excludes this from production. */
export default function PreviewIconsPage() {
  return (
    <PreviewShell tab="/settings">
      <PageHeader title="Settings" />
      <PageContent>
        <List>
          <li>
            <Link href="/preview/icons" className={PRESSABLE_ROW_CLASS}>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                <User scale="row" aria-hidden />
              </span>
              <span className="min-w-0 flex-1 font-medium">Your profile</span>
              <ChevronRight className="text-ink-subtle" aria-hidden />
            </Link>
          </li>
        </List>
        <Section title="Training">
          <List>
            <li>
              <LinkRow href="/preview/icons" icon={ClipboardList} title="Programme" />
            </li>
            <li>
              <LinkRow href="/preview/icons" icon={MapPin} title="Gyms and machines" />
            </li>
            <li>
              <LinkRow href="/preview/icons" icon={BookOpen} title="Exercise library" />
            </li>
            <li>
              <PreviewRestTimer />
            </li>
            <li>
              <LinkRow href="/preview/icons" icon={AiCoach} title="AI coach" />
            </li>
          </List>
        </Section>
        <Section title="Preferences">
          <List>
            <li>
              <AppearanceRow />
            </li>
          </List>
        </Section>
        <Section title="Account">
          <List>
            <li>
              <LinkRow href="/preview/icons" icon={KeyRound} title="Password" />
            </li>
            <li>
              <LinkRow href="/preview/icons" icon={Link2} title="Coach access" />
            </li>
          </List>
        </Section>
        <Section title="App">
          <List>
            <li>
              <LinkRow href="/preview/icons" icon={Download} title="Install Overload" />
            </li>
          </List>
        </Section>
        <List>
          <li>
            <LinkRow href="/preview/icons" icon={LogOut} title="Sign out" />
          </li>
          <li>
            <LinkRow href="/preview/icons" icon={Trash} title="Delete account" tone="danger" />
          </li>
        </List>
        <Section
          title="Selected icon family"
          description="Phosphor Duotone · AI coach uses the brain symbol. Sample content above uses the real interface components."
        >
          <ul className="grid grid-cols-3 gap-x-2 gap-y-6 py-4 sm:grid-cols-4">
            {SYMBOLS.map(([label, Icon]) => (
              <li
                key={label}
                className="flex flex-col items-center gap-2 text-center text-xs text-ink-muted"
              >
                <Icon scale="row" aria-hidden />
                <span>{label}</span>
              </li>
            ))}
          </ul>
        </Section>
      </PageContent>
    </PreviewShell>
  );
}
