import type { WarmupDrill } from "../../../domain/types";

export type WarmupProtocolSeed = {
  slug: string;
  name: string;
  description: string;
  drills: WarmupDrill[];
};

const ACE = "https://www.acefitness.org/resources/everyone/exercise-library";
const RAMP = "40% × 8; 55–60% × 5; 70–75% × 2–3";

/** Warm-up checklists from the WARMUP sheet. A session records only whether the warm-up was done. */
export const WARMUP_PROTOCOLS: readonly WarmupProtocolSeed[] = [
  {
    slug: "run",
    name: "Run warm-up",
    description: "Walk to jog, ankle and hip motion, then calf readiness.",
    drills: [
      {
        order: 1,
        name: "Walk → easy jog",
        dose: "3–5 min",
        cue: "Start deliberately slow",
        purpose: "Temperature",
      },
      {
        order: 2,
        name: "Ankle rocks",
        dose: "8–10/side",
        cue: "Heel down; knee over toes",
        purpose: "Ankle motion",
        formUrl: `${ACE}/body-part/legs-calves-and-shins/`,
      },
      {
        order: 3,
        name: "Leg swings front/back + side/side",
        dose: "8–10 each/leg",
        cue: "Controlled; no forcing",
        purpose: "Hip motion",
      },
      {
        order: 4,
        name: "Walking lunges",
        dose: "6/side",
        cue: "Knee follows toes",
        purpose: "Coordination",
      },
      {
        order: 5,
        name: "Calf raises",
        dose: "10–15",
        cue: "Smooth; no bounce",
        purpose: "Calf readiness",
      },
    ],
  },
  {
    slug: "upper",
    name: "Upper-body warm-up",
    description: "Easy cardio, shoulder motion, scapular rehearsal, then ramp sets.",
    drills: [
      { order: 1, name: "Easy cardio", dose: "3–5 min", cue: "Easy", purpose: "Temperature" },
      {
        order: 2,
        name: "Arm circles + shoulder rotations",
        dose: "8 each",
        cue: "Pain-free",
        purpose: "Shoulder motion",
      },
      {
        order: 3,
        name: "Light cable row / face pull",
        dose: "1 × 12–15",
        cue: "Very light",
        purpose: "Scapular rehearsal",
      },
      {
        order: 4,
        name: "First compound ramp",
        dose: RAMP,
        cue: "Never grind",
        purpose: "Specific prep",
      },
    ],
  },
  {
    slug: "lower",
    name: "Lower-body warm-up",
    description: "Easy bike or treadmill, hip mobility, glute and squat rehearsal, then ramp sets.",
    drills: [
      {
        order: 1,
        name: "Easy bike/treadmill",
        dose: "4–5 min",
        cue: "Easy",
        purpose: "Temperature",
      },
      {
        order: 2,
        name: "90/90 hip switches",
        dose: "6–8/side",
        cue: "Controlled",
        purpose: "Hip rotation",
      },
      {
        order: 3,
        name: "Adductor rock-back",
        dose: "8/side",
        cue: "Neutral spine",
        purpose: "Hip/adductor",
      },
      {
        order: 4,
        name: "Glute bridge",
        dose: "10",
        cue: "Ribs down; no back arch",
        purpose: "Hip extension",
        formUrl: `${ACE}/49/glute-bridge/`,
      },
      {
        order: 5,
        name: "Bodyweight squat",
        dose: "8–10",
        cue: "Controlled depth",
        purpose: "Pattern",
      },
      {
        order: 6,
        name: "First compound ramp",
        dose: RAMP,
        cue: "Never grind",
        purpose: "Specific prep",
      },
    ],
  },
  {
    slug: "daily-mobility",
    name: "Daily mobility",
    description: "Ten to fifteen minutes of hip, back and calf mobility; ideal on rest days.",
    drills: [
      {
        order: 1,
        name: "90/90 hip switches",
        dose: "6–8/side",
        cue: "Slow",
        purpose: "Hip rotation",
      },
      {
        order: 2,
        name: "Half-kneeling hip-flexor stretch",
        dose: "20–30 s/side",
        cue: "Slight pelvic tuck",
        purpose: "Hip flexor",
      },
      {
        order: 3,
        name: "Adductor rock-back",
        dose: "8/side",
        cue: "Neutral spine",
        purpose: "Adductors",
      },
      {
        order: 4,
        name: "Cat-cow",
        dose: "6–8",
        cue: "Gentle; don't chase range",
        purpose: "Back motion",
      },
      {
        order: 5,
        name: "Bird-dog",
        dose: "5/side, 3–5 s",
        cue: "Pelvis level; back quiet",
        purpose: "Trunk control",
        formUrl: `${ACE}/14/bird-dog/`,
      },
      {
        order: 6,
        name: "Glute bridge",
        dose: "10",
        cue: "Stop before lumbar arch",
        purpose: "Glute control",
        formUrl: `${ACE}/49/glute-bridge/`,
      },
      {
        order: 7,
        name: "Gentle calf stretch",
        dose: "20–30 s/side",
        cue: "No forcing",
        purpose: "Calf mobility",
      },
    ],
  },
];
