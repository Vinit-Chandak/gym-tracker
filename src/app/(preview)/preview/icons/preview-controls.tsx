"use client";

import { useState } from "react";

import { Timer } from "@/components/ui/icons";
import { InfoTip } from "@/components/ui/info-tip";
import { Row } from "@/components/ui/link-row";
import { Switch } from "@/components/ui/switch";

/** The real row and switch with local state, so this preview cannot save a preference. */
export function PreviewRestTimer() {
  const [enabled, setEnabled] = useState(true);
  return (
    <Row
      icon={Timer}
      title={
        <>
          Rest timer{" "}
          <InfoTip label="About the rest timer">
            Counts down each exercise&apos;s rest target after a set is saved.
          </InfoTip>
        </>
      }
    >
      <Switch label="Rest timer" checked={enabled} onChange={setEnabled} />
    </Row>
  );
}
