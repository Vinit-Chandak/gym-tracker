/** Average pace in seconds per kilometre; null when there is no distance to divide by. */
export function paceSecondsPerKm(distanceMeters: number, durationSeconds: number): number | null {
  if (!(distanceMeters > 0) || !(durationSeconds > 0)) return null;
  return (durationSeconds * 1000) / distanceMeters;
}

/** "6:37" style pace label. Rounds to the nearest second. */
export function formatPace(secondsPerKm: number | null): string {
  if (secondsPerKm === null || !Number.isFinite(secondsPerKm)) return "—";
  const total = Math.round(secondsPerKm);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/** "33:05" or "1:02:10" style duration label. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const mm = hours > 0 ? minutes.toString().padStart(2, "0") : minutes.toString();
  return `${hours > 0 ? `${hours}:` : ""}${mm}:${seconds.toString().padStart(2, "0")}`;
}
