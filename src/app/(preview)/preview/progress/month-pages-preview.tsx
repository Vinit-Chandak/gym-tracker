"use client";

import { useState } from "react";

import { HistoryList, type HistoryItem } from "@/app/(app)/progress/history/history-list";
import { HISTORY_PAGE_SIZE } from "@/app/(app)/progress/history/history-view";
import { PageTabs } from "@/components/ui/page-tabs";
import { formatIsoMonth } from "@/lib/format";

/**
 * The alternative to Overview's latest ten, for comparison only: the calendar's month as a list,
 * ten to a page, as History pages it. Nothing logged this month leaves it empty.
 */
export function MonthPagesPreview({ items, today }: { items: HistoryItem[]; today: string }) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(items.length / HISTORY_PAGE_SIZE));
  const name = formatIsoMonth(today.slice(0, 7), today.slice(0, 4));
  return (
    <section aria-labelledby="preview-month-list" className="mt-6 border-t border-hair pt-3">
      <h2 id="preview-month-list" className="month-head">
        <span>History</span>
      </h2>
      {items.length > 0 ? (
        <>
          <p className="type-meta-small text-ink-2 tabular-nums">
            {items.length} {items.length === 1 ? "entry" : "entries"} in {name}
            {pages > 1 && ` · page ${page} of ${pages}`}
          </p>
          <HistoryList
            items={items.slice((page - 1) * HISTORY_PAGE_SIZE, page * HISTORY_PAGE_SIZE)}
            today={today}
            level={3}
          />
          <PageTabs
            page={page}
            total={pages}
            onChange={setPage}
            label="History pages"
            className="mt-4"
          />
        </>
      ) : (
        <p className="mt-1 type-meta text-ink-2">Nothing logged in {name} yet.</p>
      )}
    </section>
  );
}
