"use client";

import { Fragment, useActionState, useId, useMemo, useRef, useState } from "react";

import { EquipmentArt } from "@/components/equipment-art/equipment-art";
import { Button } from "@/components/ui/button";
import { FormError, SubmitButton, useKeptForm } from "@/components/ui/form";
import { Glyph } from "@/components/ui/glyphs";
import { PinnedActions } from "@/components/ui/pinned-actions";
import { Sheet } from "@/components/ui/sheet";
import { Swap } from "@/components/ui/swap";
import { sameNameCandidates, searchEquipment } from "@/lib/equipment-search";
import { EQUIPMENT_CATEGORY_LABELS } from "@/lib/labels";
import { keepsFormOnDisconnect } from "@/lib/offline-submit";
import { holdEnter } from "@/lib/search-keys";
import { cn } from "@/lib/utils";
import { addStarterEquipmentAction } from "@/server/actions/onboarding";
import type { MachinesStep, StarterItem, StarterVariant } from "@/lib/machines-step";
import { INITIAL_FORM_STATE } from "@/server/validation/form";

import { SkipLink } from "../skip-link";

type Props = {
  step: MachinesStep;
  /** The drawings this screen may show, by slug; anything missing shows without a picture. */
  art: Record<string, string>;
};

type OpenSheet =
  | { kind: "basics" }
  /** `back`: the sheet it was opened from, which closing it returns to. */
  | { kind: "about"; item: StarterItem; back?: "basics" }
  | { kind: "variant"; item: StarterItem }
  | { kind: "selection" }
  | null;

const GROUP_LABELS: Record<StarterItem["category"], string> = {
  ...EQUIPMENT_CATEGORY_LABELS,
  combination: "Combination machines",
};

/** How many of the basics the collapsed line names before "and N more". */
const NAMED_BASICS = 4;

const typeKey = (typeId: string) => `type:${typeId}`;

/** "Barbell, dumbbells, flat bench and 15 more": the first few, in the catalogue's words. */
function basicsSummary(names: readonly string[]): string {
  if (names.length <= NAMED_BASICS + 1) return listed(names);
  const shown = names.slice(0, NAMED_BASICS).map((name, i) => (i === 0 ? name : lower(name)));
  return `${shown.join(", ")} and ${names.length - NAMED_BASICS} more`;
}
/** A name inside a sentence: "Dumbbells" becomes "dumbbells", "EZ curl bar" stays as it is. */
const lower = (name: string) =>
  /^[A-Z][a-z]/.test(name) ? name.charAt(0).toLowerCase() + name.slice(1) : name;
const listed = (names: readonly string[]) =>
  names.length <= 1
    ? (names[0] ?? "")
    : `${names
        .slice(0, -1)
        .map((name, i) => (i === 0 ? name : lower(name)))
        .join(", ")} and ${lower(names.at(-1)!)}`;

/**
 * The machines step (plan: onboarding flow; board Machines). What it offers depends on the place
 * and the answer to "Which sounds like you?":
 *
 * - at a gym, the basics first, as one line that counts them and opens them as pictures, where a
 *   tap records one as not here;
 * - for somebody new, a few illustrated suggestions, each with its picture, name and purpose,
 *   unticked; a family asks which variant it is, and "Not sure" registers nothing;
 * - for somebody who already trains, every other type, grouped and searchable by any of its
 *   names, with its picture behind ⓘ;
 * - outdoors, a short calisthenics set for everyone.
 *
 * Everyone can browse everything, review what they chose and skip. Nothing is saved until Add;
 * what the place already has shows as such, and an archived machine is restored, not doubled.
 */
export function EquipmentStepForm({ step, art }: Props) {
  const form = useKeptForm();
  const [state, formAction] = useActionState(
    keepsFormOnDisconnect(addStarterEquipmentAction),
    INITIAL_FORM_STATE,
  );
  const basics = step.basics;
  const basicIds = useMemo(() => new Set(basics.flatMap((item) => item.typeIds)), [basics]);
  const active = useMemo(() => new Set(step.activeTypeIds), [step.activeTypeIds]);
  const archived = useMemo(() => new Set(step.archivedTypeIds), [step.archivedTypeIds]);
  const absent = useMemo(() => new Set(step.absentTypeIds), [step.absentTypeIds]);

  const [chosen, setChosen] = useState<ReadonlySet<string>>(() => new Set());
  const [notHere, setNotHere] = useState<ReadonlySet<string>>(
    () => new Set(step.absentTypeIds.filter((id) => basicIds.has(id) && !active.has(id))),
  );
  const [sheet, setSheet] = useState<OpenSheet>(null);
  const [notice, setNotice] = useState("");
  const beginner = step.suggestions.length > 0;
  const [browsing, setBrowsing] = useState(!beginner);
  const fullList = useRef<HTMLDivElement>(null);

  const byKey = useMemo(() => {
    const items = new Map<string, StarterItem>();
    for (const item of [...step.catalogue, ...step.suggestions, ...basics])
      items.set(item.key, item);
    return items;
  }, [step.catalogue, step.suggestions, basics]);
  // A family's variant is chosen as its own type, so its row in the full list agrees.
  const variantName = useMemo(() => {
    const names = new Map<string, string>();
    for (const item of [...step.suggestions, ...step.catalogue])
      for (const variant of item.variants ?? []) names.set(variant.typeId, variant.name);
    return names;
  }, [step.suggestions, step.catalogue]);

  const isHere = (item: StarterItem) =>
    item.kind === "family"
      ? item.typeIds.some((id) => active.has(id))
      : item.typeIds.every((id) => active.has(id));
  const familyPick = (item: StarterItem) => item.typeIds.find((id) => chosen.has(typeKey(id)));
  const isChosen = (item: StarterItem) =>
    item.kind === "family" ? familyPick(item) !== undefined : chosen.has(item.key);

  const say = (next: ReadonlySet<string>) =>
    setNotice(`${next.size} ${next.size === 1 ? "item" : "items"} selected`);
  const toggle = (item: StarterItem) => {
    if (isHere(item)) return;
    if (item.kind === "family") {
      const pick = familyPick(item);
      if (pick === undefined) {
        setSheet({ kind: "variant", item });
        return;
      }
      const next = new Set(chosen);
      for (const id of item.typeIds) next.delete(typeKey(id));
      setChosen(next);
      say(next);
      return;
    }
    const next = new Set(chosen);
    if (next.has(item.key)) next.delete(item.key);
    else next.add(item.key);
    setChosen(next);
    say(next);
  };
  const chooseVariant = (item: StarterItem, typeId: string | null) => {
    const next = new Set(chosen);
    for (const id of item.typeIds) next.delete(typeKey(id));
    if (typeId) next.add(typeKey(typeId));
    setChosen(next);
    say(next);
    setSheet(null);
  };
  const markHere = (typeId: string, here: boolean) => {
    const next = new Set(notHere);
    if (here) next.delete(typeId);
    else next.add(typeId);
    setNotHere(next);
  };

  /** What a tile or row says about the place's own record of it, when that is news. */
  const status = (item: StarterItem): string | null => {
    if (isHere(item)) return "Already registered here";
    if (item.typeIds.some((id) => archived.has(id)) && item.kind !== "family")
      return "Archived here: tick to restore";
    if (item.kind !== "combination" && item.typeIds.every((id) => absent.has(id)))
      return "Marked not here";
    return null;
  };

  const count = chosen.size;
  const hereCount = basics.filter((item) => !item.typeIds.every((id) => notHere.has(id))).length;
  const notHereNames = basics
    .filter((item) => item.typeIds.every((id) => notHere.has(id)))
    .map((item) => item.name);

  const openFullList = () => {
    setBrowsing(true);
    // After the list renders: bring its search into view and put the caret in it.
    requestAnimationFrame(() => {
      fullList.current?.scrollIntoView({ block: "start" });
      fullList.current?.querySelector<HTMLInputElement>("input[type=search]")?.focus();
    });
  };

  return (
    <form ref={form} action={formAction}>
      <input type="hidden" name="gymId" value={step.gym.id} />
      {[...chosen].map((key) => {
        const [kind, id] = key.split(":");
        return (
          <input
            key={key}
            type="hidden"
            name={kind === "combination" ? "combinationId" : "typeId"}
            value={id}
          />
        );
      })}
      {[...notHere].map((id) => (
        <input key={id} type="hidden" name="notHereTypeId" value={id} />
      ))}

      {basics.length > 0 && (
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => setSheet({ kind: "basics" })}
          className="basics-line"
        >
          <span className="basics-line-text">
            <span className="basics-line-title">
              Usually here (
              <Swap id={String(hereCount)} className="tabular-nums">
                {hereCount}
              </Swap>
              )
            </span>
            <span className="basics-line-meta">
              {notHereNames.length > 0
                ? `Not here: ${listed(notHereNames.map(lower))}`
                : basicsSummary(basics.map((item) => item.name))}
            </span>
          </span>
          <span className="basics-line-action">
            Review
            <Glyph name="chevronRight" className="glyph-18" />
          </span>
        </button>
      )}

      {beginner && (
        <section aria-labelledby="suggestions-title">
          <h2 id="suggestions-title" className="caption-head mt-4">
            {step.gym.kind === "gym" ? "What else is here?" : "Common here"}
          </h2>
          <ul className="equipment-grid">
            {step.suggestions.map((item) => {
              const pick = familyPick(item);
              return (
                <StarterTile
                  key={item.key}
                  item={item}
                  art={art[pick ? (variantSlug(item, pick) ?? item.slug) : item.slug]}
                  checked={isChosen(item) || isHere(item)}
                  disabled={isHere(item)}
                  note={pick ? (variantName.get(pick) ?? null) : status(item)}
                  onToggle={() => toggle(item)}
                  onAbout={() => setSheet({ kind: "about", item })}
                />
              );
            })}
          </ul>
          {!browsing && (
            <Button variant="text" className="mt-1 -ml-2.5" onClick={openFullList}>
              Browse all equipment
            </Button>
          )}
        </section>
      )}

      {browsing && (
        <div ref={fullList} className={cn(beginner && "mt-4")}>
          <h2 className={beginner ? "caption-head" : "sr-only"}>All equipment</h2>
          <FullList
            items={step.catalogue}
            art={art}
            isChosen={isChosen}
            isHere={isHere}
            status={status}
            onToggle={toggle}
            onAbout={(item) => setSheet({ kind: "about", item })}
          />
        </div>
      )}

      <p role="status" className="sr-only">
        {notice}
      </p>

      <PinnedActions stack>
        {count > 0 && (
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={() => setSheet({ kind: "selection" })}
            className="pinned-summary"
          >
            <span>
              <Swap id={String(count)} className="tabular-nums">
                {count}
              </Swap>{" "}
              selected
            </span>
            <span className="pinned-summary-action">
              Review
              <Glyph name="chevronRight" className="glyph-18" />
            </span>
          </button>
        )}
        {sheet?.kind !== "selection" && <FormError message={state.formError} />}
        <SubmitButton pendingLabel="Saving…">
          {count === 0 ? "Continue" : `Add ${count} and continue`}
        </SubmitButton>
        {/* With nothing chosen or marked, Continue already skips: Skip is said once. */}
        {(count > 0 || notHere.size > 0) && <SkipLink href="/welcome/programme" />}
      </PinnedActions>

      <Sheet
        open={sheet?.kind === "basics"}
        onClose={() => setSheet(null)}
        title="Usually here"
        footer={
          <Button size="lg" className="w-full" onClick={() => setSheet(null)}>
            Done
          </Button>
        }
      >
        <p className="type-meta text-ink-2">Untick anything this gym doesn&rsquo;t have.</p>
        <ul className="equipment-grid">
          {basics.map((item) => {
            const registered = isHere(item);
            return (
              <StarterTile
                key={item.key}
                item={item}
                art={art[item.slug]}
                checked={registered || !item.typeIds.every((id) => notHere.has(id))}
                disabled={registered}
                note={registered ? "Registered" : null}
                compact
                onToggle={() => item.typeIds.forEach((id) => markHere(id, notHere.has(id)))}
                onAbout={() => setSheet({ kind: "about", item, back: "basics" })}
              />
            );
          })}
        </ul>
      </Sheet>

      {sheet?.kind === "variant" && (
        <VariantSheet
          item={sheet.item}
          art={art}
          onChoose={(typeId) => chooseVariant(sheet.item, typeId)}
          onClose={() => setSheet(null)}
        />
      )}

      {sheet?.kind === "about" && (
        <AboutSheet
          item={sheet.item}
          art={art}
          basic={sheet.item.typeIds.every((id) => basicIds.has(id))}
          here={isHere(sheet.item)}
          chosen={isChosen(sheet.item)}
          markedNotHere={sheet.item.typeIds.every((id) => notHere.has(id))}
          onToggle={() => {
            const item = sheet.item;
            setSheet(null);
            toggle(item);
          }}
          onMarkHere={(here) => {
            sheet.item.typeIds.forEach((id) => markHere(id, here));
            setSheet(sheet.back ? { kind: sheet.back } : null);
          }}
          // Opened from the basics' Review, it goes back there.
          onClose={() => setSheet(sheet.back ? { kind: sheet.back } : null)}
        />
      )}

      <Sheet
        open={sheet?.kind === "selection"}
        onClose={() => setSheet(null)}
        title="Selected"
        footer={
          <div className="space-y-2">
            {sheet?.kind === "selection" && <FormError message={state.formError} />}
            <SubmitButton pendingLabel="Saving…">
              {count === 0 ? "Continue" : `Add ${count} and continue`}
            </SubmitButton>
          </div>
        }
      >
        {/* A modal sheet hides the page's own status line: counts are said in here too. */}
        <p role="status" className="sr-only">
          {sheet?.kind === "selection" ? notice : ""}
        </p>
        <ul className="review-list">
          {[...chosen].map((key) => {
            const [kind, id] = key.split(":");
            const item = byKey.get(key);
            const name =
              item?.name ?? (kind === "type" ? variantName.get(id!) : undefined) ?? "Equipment";
            const restoring = kind === "type" && archived.has(id!);
            return (
              <li key={key} className="review-row">
                <div className="flex items-center gap-3">
                  <p className="picker-row-name min-w-0 flex-1 py-2.5">
                    {name}
                    {restoring && <span className="picker-row-note block">Restored</span>}
                  </p>
                  <button
                    type="button"
                    aria-label={`Remove ${name}`}
                    data-remove={key}
                    onClick={() => {
                      // The focus moves to the next row's Remove (or the one before), or to
                      // Continue when the list empties and the sheet closes.
                      const keys = [...chosen];
                      const index = keys.indexOf(key);
                      const then = keys[index + 1] ?? keys[index - 1] ?? null;
                      const next = new Set(chosen);
                      next.delete(key);
                      setChosen(next);
                      say(next);
                      if (next.size === 0) setSheet(null);
                      requestAnimationFrame(() => {
                        const root = form.current;
                        const target =
                          next.size > 0 && then
                            ? [
                                ...(root?.querySelectorAll<HTMLElement>("[data-remove]") ?? []),
                              ].find((button) => button.dataset.remove === then)
                            : root?.querySelector<HTMLElement>(
                                ".pinned-actions button[type=submit]",
                              );
                        target?.focus();
                      });
                    }}
                    className="review-remove"
                  >
                    <Glyph name="close" className="glyph-20" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </Sheet>
    </form>
  );
}

function variantSlug(item: StarterItem, typeId: string): string | undefined {
  return item.variants?.find((variant) => variant.typeId === typeId)?.slug;
}

/**
 * A picture tile: the drawing, the box and the name, the purpose under it; ticked, the tile is
 * ink and the drawing inverts with it. ⓘ stands beside the label, never inside it.
 */
function StarterTile({
  item,
  art,
  checked,
  disabled = false,
  note,
  compact = false,
  onToggle,
  onAbout,
}: {
  item: StarterItem;
  art: string | undefined;
  checked: boolean;
  disabled?: boolean;
  note: string | null;
  /** Name only: the basics' Review, where the picture and the name are enough. */
  compact?: boolean;
  onToggle: () => void;
  onAbout: () => void;
}) {
  const hintId = useId();
  // An unpicked family asks which one before it is ticked: said before the box is pressed.
  const opensChoice = item.kind === "family" && !checked && !disabled;
  return (
    <li className="equipment-tile-cell">
      <label className="equipment-tile" data-disabled={disabled || undefined}>
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={onToggle}
          aria-describedby={opensChoice ? hintId : undefined}
          className="peer sr-only"
        />
        {art ? <EquipmentArt src={art} className="equipment-tile-art" /> : null}
        <span className="equipment-tile-name">
          {/* Drawn only when ticked: forced colours would show a hidden tick in every box. */}
          <span aria-hidden className="tick-box">
            {checked && <Glyph name="check" className="glyph-15" />}
          </span>
          <span className="min-w-0 [overflow-wrap:anywhere]">{item.name}</span>
        </span>
        {!compact && item.purpose && <span className="equipment-tile-purpose">{item.purpose}</span>}
        {note && <span className="equipment-tile-note">{note}</span>}
      </label>
      {/* Outside the label, so the tile's name stays its own words. */}
      {opensChoice && (
        <span id={hintId} className="sr-only">
          Opens a choice of types
        </span>
      )}
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={`About ${item.name}`}
        onClick={onAbout}
        className="equipment-tile-info"
      >
        <Glyph name="info" className="glyph-20" />
      </button>
    </li>
  );
}

/**
 * Every type, grouped by kind while nothing is typed and ranked by any of its names when
 * something is (local names included). A search never hides a choice already made from the
 * count: the selection lives in the review, not in the results. A name that means two things
 * ("Roman chair") shows both, side by side, with their pictures.
 */
function FullList({
  items,
  art,
  isChosen,
  isHere,
  status,
  onToggle,
  onAbout,
}: {
  items: StarterItem[];
  art: Record<string, string>;
  isChosen: (item: StarterItem) => boolean;
  isHere: (item: StarterItem) => boolean;
  status: (item: StarterItem) => string | null;
  onToggle: (item: StarterItem) => void;
  onAbout: (item: StarterItem) => void;
}) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchEquipment(items, query), [items, query]);
  const candidates = useMemo(() => sameNameCandidates(items, query), [items, query]);
  const groups = useMemo(() => {
    if (query.trim()) return [{ key: "results", title: null, items: results }];
    const order: StarterItem["category"][] = [];
    for (const item of items) if (!order.includes(item.category)) order.push(item.category);
    return order.map((category) => ({
      key: category,
      title: GROUP_LABELS[category],
      items: items.filter((item) => item.category === category),
    }));
  }, [items, query, results]);

  // Choosing while the search is being typed in closes the keyboard, so the count and Add at the
  // foot are in sight again.
  const choose = (item: StarterItem) => {
    onToggle(item);
    const focused = document.activeElement;
    if (focused instanceof HTMLInputElement && focused.type === "search") focused.blur();
  };

  return (
    <div>
      <div className="search-box mt-1" data-filled={query ? "true" : undefined}>
        <Glyph name="search" className="glyph-20" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find equipment by any name…"
          aria-label="Find equipment"
          className="search-box-input"
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          onKeyDown={holdEnter}
        />
        {query && (
          <button
            type="button"
            aria-label="Clear the search"
            onClick={() => setQuery("")}
            className="search-box-clear"
          >
            <Glyph name="close" className="glyph-18" />
          </button>
        )}
      </div>

      {/* What a search found, said as well as shown. */}
      <p role="status" className="sr-only">
        {query.trim()
          ? results.length > 0
            ? `${results.length} ${results.length === 1 ? "match" : "matches"}`
            : `Nothing is called “${query.trim()}”`
          : ""}
      </p>

      {candidates.length > 1 && (
        <section aria-labelledby="same-name-title" className="mt-3">
          <h3 id="same-name-title" className="caption-head">
            “{query.trim()}” can mean either
          </h3>
          <ul className="equipment-grid">
            {candidates.map((item) => (
              <StarterTile
                key={item.key}
                item={item}
                art={art[item.slug]}
                checked={isChosen(item) || isHere(item)}
                disabled={isHere(item)}
                note={status(item)}
                onToggle={() => choose(item)}
                onAbout={() => onAbout(item)}
              />
            ))}
          </ul>
        </section>
      )}

      {results.length === 0 ? (
        <p className="mt-3 type-meta text-ink-2">Nothing is called “{query.trim()}”.</p>
      ) : (
        groups.map((group) => (
          <Fragment key={group.key}>
            {group.title && <h3 className="caption-head mt-3.5">{group.title}</h3>}
            <ul aria-label={group.title ?? "Matches"}>
              {group.items.map((item) => {
                const here = isHere(item);
                const note = status(item);
                return (
                  <li key={item.key} className="equipment-row">
                    <label className="picker-row" data-disabled={here || undefined}>
                      <input
                        type="checkbox"
                        checked={isChosen(item) || here}
                        disabled={here}
                        onChange={() => choose(item)}
                        className="peer sr-only"
                      />
                      <span className="picker-row-text">
                        <span className="picker-row-name">{item.name}</span>
                        {item.purpose && (
                          <span className="picker-row-meta">
                            <span>{item.purpose}</span>
                          </span>
                        )}
                        {note && <span className="picker-row-note">{note}</span>}
                      </span>
                      <span
                        aria-hidden
                        className="picker-tick"
                        data-on={isChosen(item) || here || undefined}
                      >
                        {(isChosen(item) || here) && <Glyph name="check" className="glyph-15" />}
                      </span>
                    </label>
                    <button
                      type="button"
                      aria-haspopup="dialog"
                      aria-label={`About ${item.name}`}
                      onClick={() => onAbout(item)}
                      className="equipment-row-info"
                    >
                      <Glyph name="info" className="glyph-20" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </Fragment>
        ))
      )}
    </div>
  );
}

/** "Which leg press?": the family's variants as pictures, and "Not sure", which picks nothing. */
function VariantSheet({
  item,
  art,
  onChoose,
  onClose,
}: {
  item: StarterItem;
  art: Record<string, string>;
  onChoose: (typeId: string | null) => void;
  onClose: () => void;
}) {
  return (
    <Sheet
      open
      onClose={onClose}
      title={`Which ${lower(item.name)}?`}
      footer={
        <Button variant="text" size="lg" className="w-full" onClick={() => onChoose(null)}>
          Not sure
        </Button>
      }
    >
      <p className="type-meta text-ink-2">A workout asks when an exercise needs one.</p>
      <ul className="equipment-grid">
        {(item.variants ?? []).map((variant) => (
          <VariantTile
            key={variant.typeId}
            variant={variant}
            art={art[variant.slug]}
            onChoose={() => onChoose(variant.typeId)}
          />
        ))}
      </ul>
    </Sheet>
  );
}

function VariantTile({
  variant,
  art,
  onChoose,
}: {
  variant: StarterVariant;
  art: string | undefined;
  onChoose: () => void;
}) {
  return (
    <li className="equipment-tile-cell">
      <button type="button" onClick={onChoose} className="equipment-tile w-full text-left">
        {art ? <EquipmentArt src={art} className="equipment-tile-art" /> : null}
        <span className="equipment-tile-name">
          <span className="min-w-0 [overflow-wrap:anywhere]">{variant.name}</span>
        </span>
        {(variant.identification ?? variant.purpose) && (
          <span className="equipment-tile-purpose">
            {variant.identification ?? variant.purpose}
          </span>
        )}
      </button>
    </li>
  );
}

/**
 * The identification sheet (plan: discovery and recognition): the drawing large, what it is for,
 * how to tell it apart in words, and its other names; a family shows each variant.
 */
function AboutSheet({
  item,
  art,
  basic,
  here,
  chosen,
  markedNotHere,
  onToggle,
  onMarkHere,
  onClose,
}: {
  item: StarterItem;
  art: Record<string, string>;
  basic: boolean;
  here: boolean;
  chosen: boolean;
  /** A basic the person has marked as not here. */
  markedNotHere: boolean;
  onToggle: () => void;
  /** For a basic: here after all, or not here. */
  onMarkHere: (here: boolean) => void;
  onClose: () => void;
}) {
  const picture = art[item.slug];
  return (
    <Sheet
      open
      onClose={onClose}
      title={item.name}
      footer={
        here ? undefined : basic ? (
          // A basic counts as here: the one thing to say about it is that it is not.
          <Button
            size="lg"
            variant="tonal"
            className="w-full"
            onClick={() => onMarkHere(markedNotHere)}
          >
            {markedNotHere ? "It’s here after all" : "Not here"}
          </Button>
        ) : (
          <Button
            size="lg"
            variant={chosen ? "tonal" : "primary"}
            className="w-full"
            onClick={onToggle}
          >
            {chosen ? "Untick" : item.kind === "family" ? "Choose which one" : "Tick it"}
          </Button>
        )
      }
    >
      {picture && item.kind !== "family" && <EquipmentArt src={picture} className="about-art" />}
      {item.purpose && <p className="mt-2 type-body">{item.purpose}</p>}
      {item.identification && (
        <>
          <h3 className="caption-head mt-3">How to recognise it</h3>
          <p className="mt-1 type-body">{item.identification}</p>
        </>
      )}
      {item.kind === "family" &&
        (item.variants ?? []).map((variant) => (
          <section key={variant.typeId} className="mt-3">
            {art[variant.slug] && (
              <EquipmentArt src={art[variant.slug]!} className="about-art about-art-small" />
            )}
            <h3 className="mt-1 type-heading">{variant.name}</h3>
            {(variant.identification ?? variant.purpose) && (
              <p className="mt-0.5 type-meta text-ink-2">
                {variant.identification ?? variant.purpose}
              </p>
            )}
          </section>
        ))}
      {item.aliases.length > 0 && (
        <p className="mt-3 type-meta text-ink-2">Also called {listed(item.aliases.map(lower))}.</p>
      )}
      {here && <p className="mt-3 type-meta font-semibold">Already registered here.</p>}
    </Sheet>
  );
}
