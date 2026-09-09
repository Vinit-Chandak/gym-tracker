import { describe, expect, it } from "vitest";

import { parseJwks } from "./jwks";

const key = {
  kty: "EC",
  crv: "P-256",
  x: "f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU",
  y: "x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0",
  kid: "9c1f0e1e-2b1c-4b3a-9d8e-1f2a3b4c5d6e",
  key_ops: ["verify"],
  alg: "ES256",
};

describe("parseJwks", () => {
  it("accepts the document Supabase publishes", () => {
    expect(parseJwks(JSON.stringify({ keys: [key] }))).toEqual({ keys: [key] });
  });

  it("treats anything else as not configured", () => {
    expect(parseJwks(undefined)).toBeNull();
    expect(parseJwks("")).toBeNull();
    expect(parseJwks("   ")).toBeNull();
    expect(parseJwks("not json")).toBeNull();
    expect(parseJwks(JSON.stringify({ keys: [] }))).toBeNull();
    expect(parseJwks(JSON.stringify({ keys: [{ kid: "no-kty" }] }))).toBeNull();
    expect(parseJwks(JSON.stringify([key]))).toBeNull();
  });
});
