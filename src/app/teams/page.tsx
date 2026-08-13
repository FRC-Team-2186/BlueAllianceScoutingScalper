"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useHomeTeam } from "@/hooks/use-home-team";
import { Skeleton } from "@/components/ui/skeleton";

/** `/teams` with no team number → redirect to the configured Home Team profile. */
export default function TeamsIndexPage() {
  const router = useRouter();
  const { homeTeamNumber, hydrated } = useHomeTeam();

  useEffect(() => {
    if (!hydrated) return;
    router.replace(`/teams/${homeTeamNumber}`);
  }, [hydrated, homeTeamNumber, router]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
