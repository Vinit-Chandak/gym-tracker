# Friends at a glance

Reverses the order in [the friends plan](../planning/FRIENDS_COMPARE_LEADERBOARD_PLAN.md) §3.4.
The Friends page led with two tall cards (an icon tile, a title and a sentence each), then a
search box, then every person you follow or who follows you, and only then recent activity.
Every new follow pushed the activity further down, and on a phone the first screen was spent
on explanations the names already give. Each choice below was put to the owner before
anything was built.

## Decisions

1. **Four one-line tiles, two by two, the way Hevy's dashboard does it.** Leaderboard,
   Compare, Find people, People. A tile is an icon and a name; nothing under it. What a
   leaderboard or a comparison does is in its name.
2. **Recent activity sits directly under the tiles**, so it is on the first screen however
   many people there are. It is still the last twenty shared sessions of the people you
   follow, a quiet list with nothing to react to.
3. **Everything that grows with the number of people lives behind People**: requests waiting
   for an answer, then Following and Followers behind the same two-way control as before, on
   `/profile/friends/people`. While a request is waiting the People tile carries the same
   "2 requests" badge the Profile tab's Friends row does. The tile shows no count otherwise:
   the counts are on the profile card and on the People page's own control.
4. **Find people is a page of its own** (`/profile/friends/find`): the one search field,
   already focused, and its results.

## Consequences

- `ShortcutTile` and `ShortcutGrid` are shared components, meant for the other screens with
  the same problem; only Friends uses them so far.
- The profile card's follower and following counts now open the People page. Old links to
  `/profile/friends?people=…` redirect there, so a bookmark still lands on the list it named.
- Following, unfollowing and answering a request revalidate the People page as well.
- The skeletons match the new geometry: tiles then rows, a two-way control then rows, a
  search box.
- No feature moved out of reach: every action is one tap further at most, and the ones
  used most (activity, leaderboard, compare) are one tap nearer.
