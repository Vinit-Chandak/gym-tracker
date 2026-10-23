import { describe, expect, it } from "vitest";

import {
  NOT_A_PLACE,
  profileInputSchema,
  timeZoneSchema,
  UNKNOWN_TIME_ZONE,
  unitsInputSchema,
} from "./profile";

/** Edit profile as it is sent from an account in kilograms: its height in centimetres. */
const metric = {
  displayName: "Sam",
  username: "sam_94",
  heightUnit: "cm",
  heightCm: "178",
  dateOfBirth: "1994-03-21",
  sex: "female",
  trainingGoal: "build_muscle",
};

/** The same from an account in pounds: its height in feet and inches. */
const imperial = {
  ...metric,
  heightUnit: "ftin",
  heightCm: "",
  heightFeet: "5",
  heightInches: "10",
};

/** Units and time zone as it is sent. */
const units = {
  timeZone: "Europe/Lisbon",
  preferredUnit: "kg",
  distanceUnit: "km",
  poolUnit: "m",
};

function parse(overrides: Record<string, string> = {}) {
  return profileInputSchema.safeParse({ ...metric, ...overrides });
}

function parseUnits(overrides: Record<string, string> = {}) {
  return unitsInputSchema.safeParse({ ...units, ...overrides });
}

/** The message the form would show against one field, or undefined when that field is happy. */
function errorFor(
  result: ReturnType<typeof parse> | ReturnType<typeof parseUnits>,
  field: string,
): string | undefined {
  if (result.success) return undefined;
  return result.error.issues.find((issue) => issue.path[0] === field)?.message;
}

describe("profile input", () => {
  it("accepts a filled-in profile, and only what Edit profile asks", () => {
    const result = parse({ bodyWeight: "74.5", timeZone: "Asia/Tokyo", preferredUnit: "lb" });
    expect(result.success && result.data).toEqual({
      displayName: "Sam",
      username: "sam_94",
      heightCm: 178,
      dateOfBirth: "1994-03-21",
      sex: "female",
      trainingGoal: "build_muscle",
    });
  });

  it("stores feet and inches as centimetres", () => {
    const result = profileInputSchema.safeParse(imperial);
    // 5′ 10″ is 70 inches.
    expect(result.success && result.data.heightCm).toBe(177.8);
  });

  it("reads height in feet alone, with the inches left blank", () => {
    const result = profileInputSchema.safeParse({ ...imperial, heightInches: "" });
    expect(result.success && result.data.heightCm).toBe(152.4);
  });

  it("reads the height in the measure the form showed it in", () => {
    // Centimetres were shown, so feet sent alongside are not the answer.
    const result = parse({ heightFeet: "3", heightInches: "1" });
    expect(result.success && result.data.heightCm).toBe(178);
    // A form that does not say is read in centimetres.
    const { heightUnit: _unit, ...unsaid } = metric;
    const read = profileInputSchema.safeParse(unsaid);
    expect(read.success && read.data.heightCm).toBe(178);
  });

  it("accepts a comma as the decimal separator", () => {
    const result = parse({ heightCm: "177,5" });
    expect(result.success && result.data.heightCm).toBe(177.5);
  });

  it("requires a name, a username, a height, a birth date and a goal", () => {
    expect(errorFor(parse({ displayName: "   " }), "displayName")).toBeDefined();
    expect(errorFor(parse({ username: "" }), "username")).toBeDefined();
    expect(errorFor(parse({ heightCm: "" }), "heightCm")).toBeDefined();
    expect(errorFor(parse({ dateOfBirth: "" }), "dateOfBirth")).toBeDefined();
    expect(errorFor(parse({ trainingGoal: "" }), "trainingGoal")).toBeDefined();
  });

  it("asks nothing of body weight, units or the zone, which are other screens'", () => {
    expect(parse({ bodyWeight: "", timeZone: "", preferredUnit: "" }).success).toBe(true);
  });

  it("makes the username canonical and holds it to the rules", () => {
    expect(
      parse({ username: " @Sam.94 " }).success && parse({ username: " @Sam.94 " }).data,
    ).toMatchObject({ username: "sam.94" });
    expect(errorFor(parse({ username: "sa" }), "username")).toBe("Use 3 to 20 characters.");
    expect(errorFor(parse({ username: "sam 94" }), "username")).toBeDefined();
    expect(errorFor(parse({ username: "coach" }), "username")).toBe("That name is reserved.");
  });

  it("reports a missing imperial height against the feet field", () => {
    const result = profileInputSchema.safeParse({
      ...imperial,
      heightFeet: "",
      heightInches: "",
    });
    expect(errorFor(result, "heightFeet")).toBeDefined();
  });

  it("treats a blank sex as prefer-not-to-say rather than an error", () => {
    const result = parse({ sex: "" });
    expect(result.success && result.data.sex).toBeNull();
  });

  it("rejects a height that is not a plausible number", () => {
    for (const value of ["30", "300", "tall", "0xb2", "1.78e2", "Infinity", "-178"]) {
      expect(parse({ heightCm: value }).success, value).toBe(false);
    }
    expect(
      errorFor(profileInputSchema.safeParse({ ...imperial, heightFeet: "9" }), "heightFeet"),
    ).toBe("Enter a height between 1′ 8″ and 8′ 6″.");
  });

  it("reports height alongside the other missing answers in one save", () => {
    const result = parse({ displayName: "", heightCm: "", dateOfBirth: "", trainingGoal: "" });
    for (const field of ["displayName", "heightCm", "dateOfBirth", "trainingGoal"])
      expect(errorFor(result, field), field).toBeDefined();
  });

  it("keeps feet whole and inches below twelve, accepting decimal inches", () => {
    expect(
      errorFor(profileInputSchema.safeParse({ ...imperial, heightFeet: "5.5" }), "heightFeet"),
    ).toBeDefined();
    expect(
      errorFor(profileInputSchema.safeParse({ ...imperial, heightInches: "12" }), "heightInches"),
    ).toBeDefined();
    expect(profileInputSchema.safeParse({ ...imperial, heightInches: "10,5" }).data?.heightCm).toBe(
      179.1,
    );
    expect(parse({ heightFeet: "not shown", heightInches: "not shown" }).success).toBe(true);
  });

  it("rejects a birth date that is not real, or not in the past", () => {
    for (const value of ["1994-02-30", "not-a-date", "3000-01-01", "1700-01-01"]) {
      expect(parse({ dateOfBirth: value }).success, value).toBe(false);
    }
  });
});

describe("units input", () => {
  it("accepts the units and a zone", () => {
    expect(parseUnits({ preferredUnit: "lb", distanceUnit: "km", poolUnit: "yd" }).data).toEqual({
      timeZone: "Europe/Lisbon",
      preferredUnit: "lb",
      distanceUnit: "km",
      poolUnit: "yd",
    });
  });

  it("rejects a time zone the platform does not know", () => {
    expect(parseUnits({ timeZone: "Mars/Olympus" }).success).toBe(false);
    expect(parseUnits({ timeZone: "" }).success).toBe(false);
  });

  it("takes a place for a time zone, never an abbreviation or an offset", () => {
    // Each reads as one zone to the browser and another, or none, to Postgres or in summer.
    for (const zone of ["EST", "IST", "BST", "CET", "+05:30", "-04:00", "Etc/GMT+5", "PST8PDT"]) {
      expect(errorFor(parseUnits({ timeZone: zone }), "timeZone"), zone).toBe(NOT_A_PLACE);
    }
    expect(errorFor(parseUnits({ timeZone: "Mars/Olympus" }), "timeZone")).toBe(UNKNOWN_TIME_ZONE);
  });

  it("keeps a zone in the platform's own spelling", () => {
    const zoneOf = (timeZone: string) => {
      const result = parseUnits({ timeZone });
      return result.success ? result.data.timeZone : null;
    };
    expect(zoneOf("america/new_york")).toBe("America/New_York");
    expect(zoneOf(" Europe/London ")).toBe("Europe/London");
    // Every name UTC goes by is UTC.
    for (const zone of ["utc", "Etc/UTC", "GMT"]) expect(zoneOf(zone), zone).toBe("UTC");
    // The name a browser reports for India is kept, whichever of its two names that is.
    expect(zoneOf("Asia/Kolkata")).toBe("Asia/Kolkata");
    expect(zoneOf("Asia/Calcutta")).toBe("Asia/Calcutta");
  });

  it("asks the same of setup's time zone", () => {
    // Setup's first step parses its units and zone with the same schema.
    expect(timeZoneSchema.safeParse("IST").success).toBe(false);
    const result = timeZoneSchema.safeParse("asia/tokyo");
    expect(result.success && result.data).toBe("Asia/Tokyo");
  });

  it("only takes the units a person weighs a barbell in", () => {
    // A machine may count plates or stack steps; a person does not.
    expect(errorFor(parseUnits({ preferredUnit: "stack_index" }), "preferredUnit")).toBe(
      "Choose kilograms or pounds.",
    );
    expect(errorFor(parseUnits({ distanceUnit: "yd" }), "distanceUnit")).toBe(
      "Choose kilometres or miles.",
    );
    expect(errorFor(parseUnits({ poolUnit: "km" }), "poolUnit")).toBe("Choose metres or yards.");
  });
});
