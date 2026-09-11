/**
 * The house coach's HTTP client for the app's service API.
 *
 * Inside a Claude Code cloud session the environment's API credential adds the bearer token
 * to every request to the app's host after it leaves the VM, so nothing here reads a secret.
 * For local runs, `COACH_SERVICE_TOKEN` in the shell adds the same header directly.
 */
import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";

/**
 * Send requests through the session's proxy, which Node's built-in `fetch` otherwise ignores.
 *
 * A cloud session reaches the internet through the proxy named in `HTTPS_PROXY`, and that is
 * also where the environment's API credential attaches the coach's bearer token. Node only
 * reads those variables when the process was started with `NODE_USE_ENV_PROXY=1` (Node 22.21
 * and later), which nothing in a `npx tsx scripts/coach/...` line sets — so every request went
 * out around the proxy, unauthenticated, and the nightly run died on a `403` naming the app's
 * own host, which reads exactly like an organisation egress denial and is not one.
 *
 * Setting undici's environment-reading agent as the global dispatcher makes `fetch` honour
 * `HTTPS_PROXY`/`NO_PROXY` in this process whatever started it. Where no proxy is configured —
 * a laptop, CI — the agent proxies nothing and this is a no-op.
 */
function routeThroughEnvironmentProxy(): void {
  const configured = ["https_proxy", "HTTPS_PROXY", "http_proxy", "HTTP_PROXY"].some((name) =>
    process.env[name]?.trim(),
  );
  if (configured) setGlobalDispatcher(new EnvHttpProxyAgent());
}

routeThroughEnvironmentProxy();

export function appUrl(): string {
  const raw = process.env.COACH_APP_URL?.trim();
  if (!raw) {
    throw new Error(
      "COACH_APP_URL is not set. Put the app's origin (https://your-app.vercel.app) in the environment.",
    );
  }
  return raw.replace(/\/+$/, "");
}

export class ServiceError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`${status} from the coach service: ${describe(body)}`);
    this.name = "ServiceError";
  }
}

function describe(body: unknown): string {
  if (body && typeof body === "object") {
    const record = body as { error?: unknown; reason?: unknown; issues?: unknown };
    const issues = Array.isArray(record.issues)
      ? record.issues
          .map((issue) => {
            const i = issue as { path?: unknown; message?: unknown };
            return `${String(i.path ?? "")}: ${String(i.message ?? "")}`;
          })
          .join("; ")
      : "";
    return [record.error, record.reason, issues].filter(Boolean).map(String).join(" · ");
  }
  return String(body);
}

export async function api<T>(
  path: string,
  init: { method?: "GET" | "POST"; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = process.env.COACH_SERVICE_TOKEN?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${appUrl()}/api/coach/service/${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(60_000),
  });
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // Not JSON: keep the text for the error message.
  }
  if (!response.ok) throw new ServiceError(response.status, body);
  return body as T;
}

/** `--name value` pairs from the command line, no libraries needed. */
export function args(argv = process.argv.slice(2)): Map<string, string> {
  const result = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key?.startsWith("--")) {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        result.set(key.slice(2), next);
        i++;
      } else result.set(key.slice(2), "true");
    }
  }
  return result;
}

export function fail(error: unknown): never {
  console.error(describeError(error));
  process.exit(1);
}

/**
 * `fetch` reports a network failure as the bare words "fetch failed" and puts what actually
 * happened — a refused connection, a name that does not resolve, a TLS chain it will not
 * trust — in the cause. A routine reading its own transcript needs the cause.
 */
function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause;
  const causeText = cause instanceof Error ? cause.message : cause ? String(cause) : "";
  return causeText ? `${error.message}: ${causeText}` : error.message;
}
