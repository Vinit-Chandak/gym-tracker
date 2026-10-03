import type { Metadata } from "next";

import { PersonCard } from "@/components/person-card";
import { AppearanceRow } from "@/components/shell/appearance-row";
import { InstallSection } from "@/components/shell/install-row";
import { PageHeader } from "@/components/shell/page-header";
import Link from "@/components/ui/app-link";
import { Glyph } from "@/components/ui/glyphs";
import { NavRow } from "@/components/ui/nav-row";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { requireUser } from "@/server/auth";
import { listSentence, missingProfileDetails } from "@/server/queries/profile";
import { getRequestProfile } from "@/server/queries/request-profile";
import { countRequests } from "@/server/repositories/follows";
import { getDirectoryProfile } from "@/server/repositories/people";

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
        getDirectoryProfile(tx, profile.username),
        countRequests(tx, user.id),
      ]);
      return { counts: directory ?? { followers: 0, following: 0 }, requests };
    },
    { readOnly: true },
  );

  // Board Profile: the person, then rows in the order they are needed: who you know, what you
  // train, how it looks and who can see it, the account, and the way out. A row says only
  // where it goes, or what it is set to; everything behind it has its own page.
  return (
    <>
      <PageHeader title="Profile" />
      <div className="page-width pb-8">
        {/* What a friend sees of you (ADR 0026); your avatar or name opens your page as a
            follower sees it. A detail still missing is said here rather than only behind Edit
            profile: a detail nobody knows is missing is a detail nobody adds. */}
        <PersonCard
          person={profile}
          counts={counts}
          countsLinkToFriends
          href={`/u/${profile.username}`}
          action={
            <Link href="/profile/edit" aria-label="Edit profile" className="round-icon-button">
              <Glyph name="edit" className="glyph-20" />
            </Link>
          }
        />
        {missing.length > 0 && (
          <Link href="/profile/edit" className="person-card-warning">
            <Glyph name="warn" className="glyph-18 shrink-0" />
            <span className="min-w-0">Add your {listSentence(missing)}</span>
          </Link>
        )}

        <ul className="mt-0.5">
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
          <ul>
            <NavRow href="/profile/programme" glyph="table" label="Programme" />
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
          <ul>
            <AppearanceRow />
            <NavRow href="/profile/privacy" glyph="lock" label="Privacy" />
          </ul>
        </section>

        <section aria-labelledby="profile-account">
          <h2 id="profile-account" className="caption-head mt-4.5">
            Account
          </h2>
          <ul>
            <NavRow href="/profile/password" glyph="password" label="Password" />
            <NavRow href="/profile/coach" glyph="key" label="Coach access" />
          </ul>
        </section>

        <InstallSection />

        <ul className="mt-3">
          <SignOutRow />
          <NavRow href="/profile/delete-account" glyph="trash" label="Delete account" />
        </ul>
      </div>
    </>
  );
}
