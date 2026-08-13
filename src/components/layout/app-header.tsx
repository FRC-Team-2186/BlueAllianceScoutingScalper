"use client";

import Link from "next/link";
import { HomeTeamSettingsButton } from "@/components/home-team/home-team-settings";
import { useHomeTeam } from "@/hooks/use-home-team";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function AppHeader() {
  const { homeTeamNumber } = useHomeTeam();

  return (
    <header className="border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/" className="text-sm font-semibold tracking-tight">
            FRC Scout
          </Link>
          <Badge variant="secondary">Home {homeTeamNumber}</Badge>
          <nav className="flex flex-wrap gap-1">
            <Link
              href="/"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              Dashboard
            </Link>
            <Link
              href={`/teams/${homeTeamNumber}`}
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              Team profile
            </Link>
            <Link
              href="/compare"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              Compare
            </Link>
          </nav>
        </div>
        <HomeTeamSettingsButton />
      </div>
    </header>
  );
}
