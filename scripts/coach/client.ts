/**
 * The house coach's HTTP client for the app's service API.
 *
 * Inside a Claude Code cloud session the environment's API credential adds the bearer token
 * to every request to the app's host after it leaves the VM, so nothing here reads a secret.
 * For local runs, `COACH_SERVICE_TOKEN` in the shell adds the same header directly.
 */

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
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
