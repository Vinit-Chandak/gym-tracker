import type { Metadata } from "next";

import { AppearanceRow } from "@/components/shell/appearance-row";
import { InstallSection } from "@/components/shell/install-row";
import { PageHeader } from "@/components/shell/page-header";
import Link from "@/components/ui/app-link";
import { Avatar } from "@/components/ui/avatar";
import { Figures } from "@/components/ui/figures";
import { Glyph } from "@/components/ui/glyphs";
import { NavRow } from "@/components/ui/nav-row";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { requireUser } from "@/server/auth";
import { listSentence, missingProfileDetails } from "@/server/queries/profile";
import { getRequestProfile } from "@/server/queries/request-profile";
import { countRequests } from "@/server/repositories/follows";
import { getDirectoryProfileById } from "@/server/repositories/people";
import { FACT_SEPARATOR } from "@/lib/facts";

import { RestTimerSetting } from "./rest-timer-setting";
import { SignOutRow } from "./sign-out-row";

export const metadata: Metadata = { title: "Profile" };

/**
 * Coming back to this tab within a minute shows what it showed, without asking the server
 * (ADR 0030). Any change made in the app clears that copy at once; only a change made
 * elsewhere, on another device or by the coach, can take up to the minute to appear.
 */
export const unstable_dynamicStaleTime = 60;

export default async function ProfilePage() {
  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  const missing = missingProfileDetails(profile);
  // Who follows you is read live, never cached with the profile: it is other people's doing.
  const { counts, requests } = await withUser(
    getDb(),
    user.id,
    async (tx) => {
      const [directory, requests] = await Promise.all([
        // By id: the cached profile's username can be one a rename on another device gave up.
        getDirectoryProfileById(tx, user.id),
        countRequests(tx, user.id),
      ]);
      return { counts: directory ?? { followers: 0, following: 0 }, requests };
    },
    { readOnly: true },
  );

  // Each count keeps its word on its line ("2 following", never "2 / following").
  const followers = `${counts.followers}\u00a0${counts.followers === 1 ? "follower" : "followers"}`;
  const following = `${counts.following}\u00a0following`;
  const publicPage = `/u/${profile.username}` as const;

  // Board Profile: the person, then rows in the order they are needed: who you know, what you
  // train, how it looks, what it measures in and who can see it, the account, and the way out.
  // A row says only where it goes, or what it is set to; everything behind it has its own page.
  return (
    // Settings stand as panels on the grouped ground (DESIGN.md, Layout: Forms and settings).
    <div className="ov-grouped-page">
      {/* The athlete is the headline (DESIGN.md, Tab roots), their avatar before it: what a
          friend sees of you (ADR 0026). The handle opens your page as a follower sees it, and
          the avatar the same for a thumb; the counts open the lists they count. */}
      <PageHeader
        tab="Profile"
        title={profile.displayName || profile.username}
        lead={
          <Link href={publicPage} tabIndex={-1} aria-hidden className="shrink-0 rounded-full">
            <Avatar
              username={profile.username}
              displayName={profile.displayName}
              size="header"
              className="person-card-avatar"
            />
          </Link>
        }
        meta={
          <span className="min-w-0">
            <Link href={publicPage} className="tap-area">
              @{profile.username}
            </Link>
            {FACT_SEPARATOR}
            <Link href="/profile/friends/people?people=followers" className="tap-area">
              <Figures>{followers}</Figures>
            </Link>
            {FACT_SEPARATOR}
            <Link href="/profile/friends/people?people=following" className="tap-area">
              <Figures>{following}</Figures>
            </Link>
          </span>
        }
        action={
          // The pencil says its word (IA audit M8): a glyph alone was a way in nobody guessed.
          // Its name says what it edits, starting with the word it shows.
          <Link
            href="/profile/edit"
            aria-label="Edit profile"
            className="profile-edit-button type-meta font-bold"
          >
            <Glyph name="edit" className="glyph-18" />
            Edit
          </Link>
        }
      />
      <div className="page-width pb-8">
        {/* A detail still missing is said here rather than only behind Edit profile: a detail
            nobody knows is missing is a detail nobody adds. */}
        {missing.length > 0 && (
          <Link href="/profile/edit" className="person-card-warning">
            <Glyph name="warn" className="glyph-18 shrink-0" />
            <span className="min-w-0">Add your {listSentence(missing)}</span>
          </Link>
        )}

        <ul className="ov-panel ov-panel-list mt-0.5">
          <NavRow
            href="/profile/friends"
            glyph="people"
            label="Friends"
            badge={requests > 0 && `${requests} ${requests === 1 ? "request" : "requests"}`}
          />
        </ul>

        <section aria-labelledby="profile-training">
          <h2 id="profile-training" className="caption-head mt-4.5">
            Training
          </h2>
          <ul className="ov-panel ov-panel-list">
            {/* Which sports the app offers, chosen in setup and changed only here. */}
            <NavRow href="/profile/sports" glyph="distance" label="Sports" />
            {/* The zones a plan's "zone 2" and a run's heart rate are read against (ADR 0059). */}
            <NavRow href="/profile/heart-rate" glyph="heart" label="Heart rate zones" />
            <NavRow href="/gyms" glyph="pin" label="Gyms and machines" />
            <NavRow href="/exercises" glyph="book" label="Exercise library" />
            <RestTimerSetting enabled={profile.restTimerEnabled} />
            <NavRow href="/profile/ai-coach" glyph="coach" label="AI coach" />
          </ul>
        </section>

        <section aria-labelledby="profile-preferences">
          <h2 id="profile-preferences" className="caption-head mt-4.5">
            Preferences
          </h2>
          <ul className="ov-panel ov-panel-list">
            <AppearanceRow />
            <NavRow href="/profile/units" glyph="ruler" label="Units and time zone" />
            <NavRow href="/profile/privacy" glyph="lock" label="Privacy" />
          </ul>
        </section>

        <section aria-labelledby="profile-account">
          <h2 id="profile-account" className="caption-head mt-4.5">
            Account
          </h2>
          <ul className="ov-panel ov-panel-list">
            <NavRow href="/profile/password" glyph="password" label="Password" />
          </ul>
        </section>

        <InstallSection />

        <ul className="ov-panel ov-panel-list mt-4.5">
          <SignOutRow userId={user.id} />
          <NavRow href="/profile/delete-account" glyph="trash" label="Delete account" />
        </ul>
      </div>
    </div>
  );
}
