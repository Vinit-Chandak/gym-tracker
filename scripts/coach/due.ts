import { api, fail } from "./client";

/**
 * Who the nightly run should plan for. Prints one line per athlete: the user id, the gym and
 * the slot. Athletes appear here only when they switched the coach on and have a lifting
 * session still to do.
 */
type Due = {
  users: {
    userId: string;
    timeZone: string;
    gymId: string;
    gymName: string;
    slot: { cycleIndex: number; dayIndex: number; dayName: string };
  }[];
};

api<Due>("due")
  .then((due) => {
    if (due.users.length === 0) {
      console.log("Nobody is due for a plan.");
      return;
    }
    for (const u of due.users) {
      console.log(
        `user=${u.userId} gym=${u.gymId} gymName="${u.gymName}" slot=${u.slot.cycleIndex}:${u.slot.dayIndex} day="${u.slot.dayName}" tz=${u.timeZone}`,
      );
    }
  })
  .catch(fail);
