// A stand-in for Supabase Auth (GoTrue) on your own machine, so `next dev` can run against a
// local Postgres without touching the hosted project. It answers the handful of endpoints the
// app's server-side Supabase client calls — sign-up, password sign-in, refresh, sign-out, the
// user document, the JWKS — and signs sessions with an ES256 key it keeps in the database, so
// `getClaims()` verifies them exactly as it verifies production sessions. Accounts live in the
// same `auth.users` table the test suite stubs (see src/db/test/pglite.ts), so the app's own
// profile trigger runs on sign-up. Nothing here is reachable from a production build.
//
//   node scripts/dev/auth-stub.mjs            # listens on 127.0.0.1:54321
//   AUTH_STUB_DATABASE_URL=... AUTH_STUB_PORT=...
//
// Development only: passwords are scrypt-hashed, but there is no rate limiting, no email
// confirmation and no admin authentication beyond the service-role string in .env.

import { createServer } from "node:http";
import {
  createHash,
  createPrivateKey,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
  scryptSync,
  sign,
  timingSafeEqual,
} from "node:crypto";

import postgres from "postgres";

const PORT = Number(process.env.AUTH_STUB_PORT ?? 54321);
const DATABASE_URL =
  process.env.AUTH_STUB_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/overload_dev";
const ISSUER = `http://127.0.0.1:${PORT}/auth/v1`;
const ACCESS_TOKEN_SECONDS = 60 * 60;

const sql = postgres(DATABASE_URL, { max: 2, prepare: false });

// --- Signing key: one P-256 pair, generated on first run and kept in auth.dev_signing_key ---

async function loadSigningKey() {
  const [row] = await sql`select private_jwk, public_jwk from auth.dev_signing_key where id = 1`;
  if (row) {
    return {
      privateKey: createPrivateKey({ key: row.private_jwk, format: "jwk" }),
      publicJwk: row.public_jwk,
    };
  }
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const kid = randomUUID();
  const publicJwk = {
    ...publicKey.export({ format: "jwk" }),
    kid,
    alg: "ES256",
    use: "sig",
    key_ops: ["verify"],
  };
  const privateJwk = { ...privateKey.export({ format: "jwk" }), kid };
  await sql`insert into auth.dev_signing_key (id, private_jwk, public_jwk)
            values (1, ${sql.json(privateJwk)}, ${sql.json(publicJwk)})`;
  return { privateKey, publicJwk };
}

const b64url = (input) => Buffer.from(input).toString("base64url");

function signJwt(privateKey, kid, payload) {
  const header = b64url(JSON.stringify({ alg: "ES256", typ: "JWT", kid }));
  const body = b64url(JSON.stringify(payload));
  const signature = sign("sha256", Buffer.from(`${header}.${body}`), {
    key: privateKey,
    dsaEncoding: "ieee-p1363",
  });
  return `${header}.${body}.${signature.toString("base64url")}`;
}

function decodeJwt(token) {
  const [, body] = token.split(".");
  return JSON.parse(Buffer.from(body, "base64url").toString());
}

// --- Passwords ------------------------------------------------------------------------------

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 32).toString("hex")}`;
}

function verifyPassword(password, stored) {
  if (!stored) return false;
  const [salt, hash] = stored.split(":");
  return timingSafeEqual(scryptSync(password, salt, 32), Buffer.from(hash, "hex"));
}

// --- Users and sessions ---------------------------------------------------------------------

function userDocument(row) {
  const iso = new Date(row.created_at).toISOString();
  return {
    id: row.id,
    aud: "authenticated",
    role: "authenticated",
    email: row.email,
    email_confirmed_at: iso,
    phone: "",
    confirmed_at: iso,
    last_sign_in_at: new Date().toISOString(),
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: row.raw_user_meta_data ?? {},
    identities: [
      {
        identity_id: createHash("sha1").update(row.id).digest("hex").slice(0, 32),
        id: row.id,
        user_id: row.id,
        identity_data: { email: row.email, email_verified: true, sub: row.id },
        provider: "email",
        last_sign_in_at: iso,
        created_at: iso,
        updated_at: iso,
      },
    ],
    created_at: iso,
    updated_at: iso,
    is_anonymous: false,
  };
}

async function issueSession(key, row) {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: ISSUER,
    sub: row.id,
    aud: "authenticated",
    exp: now + ACCESS_TOKEN_SECONDS,
    iat: now,
    email: row.email,
    phone: "",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: row.raw_user_meta_data ?? {},
    role: "authenticated",
    aal: "aal1",
    amr: [{ method: "password", timestamp: now }],
    session_id: randomUUID(),
    is_anonymous: false,
  };
  const refreshToken = randomBytes(24).toString("base64url");
  await sql`insert into auth.refresh_tokens (token, user_id) values (${refreshToken}, ${row.id})`;
  return {
    access_token: signJwt(key.privateKey, key.publicJwk.kid, claims),
    token_type: "bearer",
    expires_in: ACCESS_TOKEN_SECONDS,
    expires_at: claims.exp,
    refresh_token: refreshToken,
    user: userDocument(row),
  };
}

async function findUser(where) {
  const [row] = await sql`select * from auth.users where ${where} limit 1`;
  return row ?? null;
}

async function userFromBearer(req) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;
  try {
    const claims = decodeJwt(token);
    if (!claims.sub || claims.exp <= Date.now() / 1000) return null;
    return findUser(sql`id = ${claims.sub}`);
  } catch {
    return null;
  }
}

// --- HTTP -----------------------------------------------------------------------------------

function readJson(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function send(res, status, body) {
  const json = body === undefined ? "" : JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "*",
  });
  res.end(json);
}

const fail = (res, status, error_code, msg) => send(res, status, { code: status, error_code, msg });

async function handle(req, res, key) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname.replace(/^\/auth\/v1/, "");
  if (req.method === "OPTIONS") return send(res, 204);

  if (req.method === "GET" && path === "/.well-known/jwks.json") {
    return send(res, 200, { keys: [key.publicJwk] });
  }
  if (req.method === "GET" && path === "/health") return send(res, 200, { name: "auth-stub" });

  if (req.method === "POST" && path === "/signup") {
    const body = await readJson(req);
    const email = String(body.email ?? "")
      .trim()
      .toLowerCase();
    const password = String(body.password ?? "");
    if (!email || password.length < 6) {
      return fail(res, 422, "validation_failed", "Email and password are required.");
    }
    if (await findUser(sql`email = ${email}`)) {
      return fail(res, 422, "user_already_exists", "User already registered");
    }
    const id = randomUUID();
    const metadata = body.data && typeof body.data === "object" ? body.data : {};
    await sql`insert into auth.users (id, email, raw_user_meta_data, encrypted_password)
              values (${id}, ${email}, ${sql.json(metadata)}, ${hashPassword(password)})`;
    return send(res, 200, await issueSession(key, await findUser(sql`id = ${id}`)));
  }

  if (req.method === "POST" && path === "/token") {
    const body = await readJson(req);
    const grant = url.searchParams.get("grant_type");
    if (grant === "password") {
      const email = String(body.email ?? "")
        .trim()
        .toLowerCase();
      const row = await findUser(sql`email = ${email}`);
      if (!row || !verifyPassword(String(body.password ?? ""), row.encrypted_password)) {
        return fail(res, 400, "invalid_credentials", "Invalid login credentials");
      }
      return send(res, 200, await issueSession(key, row));
    }
    if (grant === "refresh_token") {
      const token = String(body.refresh_token ?? "");
      const [found] =
        await sql`delete from auth.refresh_tokens where token = ${token} returning user_id`;
      const row = found ? await findUser(sql`id = ${found.user_id}`) : null;
      if (!row) return fail(res, 400, "refresh_token_not_found", "Invalid Refresh Token");
      return send(res, 200, await issueSession(key, row));
    }
    return fail(res, 400, "unsupported_grant_type", `Unsupported grant type "${grant}".`);
  }

  if (req.method === "POST" && path === "/logout") {
    const row = await userFromBearer(req);
    if (row && url.searchParams.get("scope") !== "others") {
      await sql`delete from auth.refresh_tokens where user_id = ${row.id}`;
    }
    return send(res, 204);
  }

  if (path === "/user" && (req.method === "GET" || req.method === "PUT")) {
    const row = await userFromBearer(req);
    if (!row) return fail(res, 401, "bad_jwt", "invalid JWT");
    if (req.method === "GET") return send(res, 200, userDocument(row));
    const body = await readJson(req);
    if (typeof body.password === "string") {
      if (verifyPassword(body.password, row.encrypted_password)) {
        return fail(
          res,
          422,
          "same_password",
          "New password should be different from the old password.",
        );
      }
      await sql`update auth.users set encrypted_password = ${hashPassword(body.password)} where id = ${row.id}`;
    }
    if (body.data && typeof body.data === "object") {
      const merged = { ...(row.raw_user_meta_data ?? {}), ...body.data };
      await sql`update auth.users set raw_user_meta_data = ${sql.json(merged)} where id = ${row.id}`;
    }
    if (typeof body.email === "string" && body.email.trim()) {
      await sql`update auth.users set email = ${body.email.trim().toLowerCase()} where id = ${row.id}`;
    }
    return send(res, 200, userDocument(await findUser(sql`id = ${row.id}`)));
  }

  // Password reset: no email leaves this machine; the request simply succeeds.
  if (req.method === "POST" && path === "/recover") return send(res, 200, {});

  // Account deletion (Profile → Delete account) uses the admin API with the service-role key.
  const admin = path.match(/^\/admin\/users\/([0-9a-f-]{36})$/);
  if (admin && req.method === "DELETE") {
    const token = (req.headers.authorization ?? "").replace(/^Bearer /, "");
    if (token !== (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "dev-service-role-key")) {
      return fail(res, 401, "bad_jwt", "invalid JWT");
    }
    await sql`delete from auth.users where id = ${admin[1]}`;
    return send(res, 200, {});
  }

  return fail(res, 404, "not_found", `No route for ${req.method} ${url.pathname}`);
}

const key = await loadSigningKey();
createServer((req, res) => {
  handle(req, res, key).catch((error) => {
    console.error(error);
    if (!res.headersSent) fail(res, 500, "unexpected_failure", String(error?.message ?? error));
  });
}).listen(PORT, "127.0.0.1", () => {
  console.log(
    `Auth stub listening on http://127.0.0.1:${PORT}/auth/v1 (database ${DATABASE_URL.replace(/\/\/.*@/, "//…@")})`,
  );
});
