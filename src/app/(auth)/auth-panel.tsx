import type { ReactNode } from "react";

/**
 * The form the athlete is filling in: the one opaque container on the auth sheet, with the
 * screen's name as its first line.
 */
export function AuthPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel panel-padding space-y-4">
      <h2 className="text-xl">{title}</h2>
      {children}
    </section>
  );
}
