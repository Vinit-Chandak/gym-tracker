"use client";

import { useMemo, useState } from "react";
import type { Route } from "next";
import { Badge } from "@/components/ui/badge";
import { LinkRow, List } from "@/components/ui/link-row";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

export type HistoryItem = {
  id: string;
  kind: "workout" | "run" | "recovery";
  date: string;
  title: string;
  subtitle: string;
  href?: Route<`/workouts/${string}` | `/runs/${string}`>;
  meta: string;
  gymId: string | null;
  exercises: { id: string; name: string; machineId: string | null; machineName: string | null }[];
  recovery?: string;
};

export function HistoryView({
  items,
  gyms,
}: {
  items: HistoryItem[];
  gyms: { id: string; name: string }[];
}) {
  const [kind, setKind] = useState("all"),
    [gym, setGym] = useState(""),
    [exercise, setExercise] = useState(""),
    [machine, setMachine] = useState("");
  const choices = useMemo(
    () =>
      [
        ...new Map(
          items.flatMap((item) =>
            item.exercises.map((e) => [e.id, { id: e.id, name: e.name }] as const),
          ),
        ).values(),
      ].sort((a, b) => a.name.localeCompare(b.name)),
    [items],
  );
  const machines = useMemo(
    () => [
      ...new Map(
        items
          .filter((item) => !gym || item.gymId === gym)
          .flatMap((item) =>
            item.exercises
              .filter((e) => (!exercise || e.id === exercise) && e.machineId)
              .map((e) => [e.machineId!, { id: e.machineId!, name: e.machineName! }] as const),
          ),
      ).values(),
    ],
    [items, gym, exercise],
  );
  const shown = items.filter(
    (item) =>
      (kind === "all" || item.kind === kind) &&
      (!gym || item.gymId === gym) &&
      ((!exercise && !machine) ||
        item.exercises.some(
          (e) => (!exercise || e.id === exercise) && (!machine || e.machineId === machine),
        )),
  );
  return (
    <div className="space-y-4">
      <Card>
        {/* One filter per row: gym, exercise and machine names are long enough that a
            half-width native select clips them mid-word, with no ellipsis to warn you. */}
        <div className="space-y-3">
          <Field label="Activity">
            <Select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="all">All activity</option>
              <option value="workout">Workouts</option>
              <option value="run">Runs</option>
              <option value="recovery">Recovery</option>
            </Select>
          </Field>
          <Field label="Gym">
            <Select
              value={gym}
              onChange={(e) => {
                setGym(e.target.value);
                setMachine("");
              }}
            >
              <option value="">All gyms</option>
              {gyms.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Exercise">
            <Select
              value={exercise}
              onChange={(e) => {
                setExercise(e.target.value);
                setMachine("");
              }}
            >
              <option value="">All exercises</option>
              {choices.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Machine">
            <Select value={machine} onChange={(e) => setMachine(e.target.value)}>
              <option value="">All machines</option>
              {machines.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>
      <p role="status" className="px-1 text-xs text-ink-muted">
        {shown.length} {shown.length === 1 ? "entry" : "entries"}
      </p>
      {shown.length ? (
        <List>
          {shown.map((item) => (
            <li key={item.id}>
              {item.href ? (
                <LinkRow
                  href={item.href}
                  title={item.title}
                  subtitle={item.subtitle}
                  meta={item.meta}
                  badge={<Badge>{item.kind === "run" ? "Run" : "Workout"}</Badge>}
                />
              ) : (
                <div className="space-y-1 px-4 py-3">
                  <p className="font-medium">
                    {item.title} <Badge>Recovery</Badge>
                  </p>
                  <p className="text-sm text-ink-muted">{item.subtitle}</p>
                </div>
              )}
              {item.recovery && <p className="px-4 pb-3 text-xs text-ink-muted">{item.recovery}</p>}
            </li>
          ))}
        </List>
      ) : (
        <Card>
          <p className="font-medium">No matching activity</p>
          <p className="text-sm text-ink-muted">
            Finished workouts, runs and recovery readings appear here. Try a wider date range or
            clear the filters.
          </p>
        </Card>
      )}
    </div>
  );
}
