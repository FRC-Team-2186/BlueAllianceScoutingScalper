"use client";

import { useId, useState } from "react";
import { Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useHomeTeam } from "@/hooks/use-home-team";
import { parseHomeTeamNumber } from "@/lib/home-team";

export function HomeTeamSettingsButton() {
  const { homeTeamNumber, setHomeTeamNumber, defaultHomeTeamNumber } =
    useHomeTeam();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(String(defaultHomeTeamNumber));
  const titleId = useId();

  function openModal() {
    setDraft(String(homeTeamNumber));
    setOpen(true);
  }

  function handleSave() {
    const next = parseHomeTeamNumber(draft);
    if (next == null) {
      toast.error("Enter a valid FRC team number");
      return;
    }
    setHomeTeamNumber(next);
    setOpen(false);
    toast.success(`Home team set to ${next}`);
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={openModal}
      >
        <Settings2 className="size-3.5" />
        Set Home Team (Default: {defaultHomeTeamNumber})
      </Button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="presentation"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="w-full max-w-md rounded-xl border bg-background p-5 shadow-lg"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id={titleId} className="text-lg font-semibold tracking-tight">
              Home Team
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Saved in browser localStorage as{" "}
              <code className="rounded bg-muted px-1">homeTeamNumber</code>.
              Dashboard, team profile links, and `/compare` default to this team
              when no URL team is specified.
            </p>

            <label className="mt-4 block text-sm font-medium" htmlFor="home-team-input">
              Team number
            </label>
            <Input
              id="home-team-input"
              className="mt-1.5"
              inputMode="numeric"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleSave();
                if (event.key === "Escape") setOpen(false);
              }}
              placeholder={String(defaultHomeTeamNumber)}
              autoFocus
            />

            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={handleSave}>
                Save · current {homeTeamNumber}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
