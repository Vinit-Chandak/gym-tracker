/**
 * Whether two stored-JSON values hold the same content.
 *
 * `JSON.stringify(a) === JSON.stringify(b)` is the obvious way to compare two plain values,
 * and it is wrong the moment one of them has been through the database. Postgres `jsonb` does
 * not keep an object's keys in the order they were written — it sorts them by length and then
 * bytewise — while Zod builds its output in the order the schema declares its shape. So a
 * prescription read back from `occurrence_versions` and the very same prescription parsed from
 * a coach's payload stringify differently, key for key identical content and all:
 *
 *   read back from jsonb : {"note":…,"paceNote":…,"progressionNote":…,"symptomStopRule":…}
 *   parsed by the schema : {"paceNote":…,"progressionNote":…,"symptomStopRule":…,"note":…}
 *
 * A comparison that answers "these differ" there is not a stricter comparison, it is a broken
 * one: it reports an edit nobody made, and no payload the coach can write will satisfy it.
 *
 * Array order, by contrast, is content and not encoding. The steps of a session happen in the
 * order they are written and a range is a `[low, high]` pair, so arrays are compared element
 * by element and never sorted. Only object keys are order-insensitive here.
 *
 * `undefined` is absence, matching `JSON.stringify`: a key present with no value is the same
 * as no key, which is what a value that has been through the database looks like.
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * What `JSON.stringify` would have compared.
 *
 * A `Date` is an object with no keys of its own, so comparing one key by key would call any
 * two dates equal. `JSON.stringify` asks it for its `toJSON` instead, and so does this.
 */
function asJson(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const { toJSON } = value as { toJSON?: unknown };
  return typeof toJSON === "function" ? (toJSON as () => unknown).call(value) : value;
}

/** The keys that carry content. A key set to `undefined` does not survive storage. */
const contentKeys = (value: Record<string, unknown>) =>
  Object.keys(value).filter((key) => value[key] !== undefined);

export function jsonEqual(a: unknown, b: unknown): boolean {
  const left = asJson(a);
  const right = asJson(b);
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((item, index) => jsonEqual(item, right[index]));
  }
  if (isRecord(left) && isRecord(right)) {
    const keys = contentKeys(left);
    if (keys.length !== contentKeys(right).length) return false;
    return keys.every((key) => jsonEqual(left[key], right[key]));
  }
  return false;
}
