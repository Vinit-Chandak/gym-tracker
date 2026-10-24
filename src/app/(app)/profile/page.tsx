import type { Metadata } from "next";

import { AppearanceRow } from "@/components/shell/appearance-row";
import { InstallSection } from "@/components/shell/install-row";
import Link from "@/components/ui/app-link";
import { Avatar } from "@/components/ui/avatar";
import { LinkButton } from "@/components/ui/button";
import { Glyph } from "@/components/ui/glyphs";
import { NavRow } from "@/components/ui/nav-row";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { requireUser } from "@/server/auth";
import { listSentence, missingProfileDetails } from "@/server/queries/profile";
import { getRequestProfile } from "@/server/queries/request-profile";
import { countRequests } from "@/server/repositories/follows";
import { getDirectoryProfileById } from "@/server/repositories/people";

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

  const publicPage = `/u/${profile.username}` as const;
  const name = profile.displayName || profile.username;

  // Board Profile: the person, then rows in the order they are needed: who you know, what you
  // train, how it looks, what it measures in and who can see it, the account, and the way out.
  // A row says only where it goes, or what it is set to; everything behind it has its own page.
  return (
    // Settings stand as panels on the grouped ground (DESIGN.md, Layout: Forms and settings).
    <div className="ov-grouped-page">
      {/* The athlete leads, as one card (owner, 24 October 2026): a row that opens your page as
          a follower sees it (the avatar, your name, your handle and its chevron, one target),
          the two counts as two figures that open the lists they count, and Edit profile named
          in words. Four separate links in a headline, the name at a title's size and Edit
          dropped onto a line of its own, left nobody sure what any of them did. */}
      <header className="page-header page-width pt-safe">
        <h1 className="sr-only">Profile, {name}</h1>
        <section aria-label="You" className="ov-panel profile-card">
          <Link href={publicPage} className="profile-card-person">
            <Avatar
              username={profile.username}
              displayName={profile.displayName}
              size="header"
              className="profile-card-avatar"
            />
            <span className="min-w-0 flex-1">
              <span className="profile-card-name">{name}</span>
              <span className="profile-card-handle">@{profile.username}</span>
            </span>
            <Glyph name="chevronRight" className="glyph-20 shrink-0 text-ink-2" />
          </Link>
          <div className="profile-card-counts">
            <Link href="/profile/friends/people?people=followers" className="profile-card-count">
              <span className="profile-card-figure">{counts.followers}</span>
              <span>{counts.followers === 1 ? "Follower" : "Followers"}</span>
            </Link>
            <Link href="/profile/friends/people?people=following" className="profile-card-count">
              <span className="profile-card-figure">{counts.following}</span>
              <span>Following</span>
            </Link>
          </div>
          <LinkButton href="/profile/edit" variant="tonal" className="w-full">
            <Glyph name="edit" className="glyph-18" />
            Edit profile
          </LinkButton>
          {/* A detail still missing is said here rather than only behind Edit profile: a detail
              nobody knows is missing is a detail nobody adds. */}
          {missing.length > 0 && (
            <Link href="/profile/edit" className="profile-card-missing">
              <Glyph name="warn" className="glyph-18 shrink-0" />
              <span className="min-w-0 flex-1">Add your {listSentence(missing)}</span>
              <Glyph name="chevronRight" className="glyph-18 shrink-0 text-ink-2" />
            </Link>
          )}
        </section>
      </header>
      <div className="page-width page-stack pb-8">
        <ul className="ov-panel ov-panel-list">
          <NavRow
            href="/profile/friends"
            glyph="people"
            label="Friends"
            badge={requests > 0 && `${requests} ${requests === 1 ? "request" : "requests"}`}
          />
        </ul>

        <section aria-labelledby="profile-training">
          <h2 id="profile-training" className="caption-head">
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
          <h2 id="profile-preferences" className="caption-head">
            Preferences
          </h2>
          <ul className="ov-panel ov-panel-list">
            <AppearanceRow />
            <NavRow href="/profile/units" glyph="ruler" label="Units and time zone" />
            <NavRow href="/profile/privacy" glyph="lock" label="Privacy" />
          </ul>
        </section>

        <section aria-labelledby="profile-account">
          <h2 id="profile-account" className="caption-head">
            Account
          </h2>
          <ul className="ov-panel ov-panel-list">
            <NavRow href="/profile/password" glyph="password" label="Password" />
          </ul>
        </section>

        <InstallSection />

        <ul className="ov-panel ov-panel-list">
          <SignOutRow userId={user.id} />
          <NavRow href="/profile/delete-account" glyph="trash" label="Delete account" />
        </ul>
      </div>
    </div>
  );
}
