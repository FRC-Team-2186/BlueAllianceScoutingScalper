import { notFound } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { PUBLIC_CONFIG } from "@/lib/config/public";

type TeamPageProps = {
  params: Promise<{ teamKey: string }>;
};

export default async function TeamPage({ params }: TeamPageProps) {
  const { teamKey } = await params;
  const teamNumber = Number(teamKey);

  if (!Number.isFinite(teamNumber)) {
    notFound();
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Team {teamNumber}</h1>
          <p className="text-sm text-muted-foreground">
            Team profile route scaffold (Phase 4+ will expand this view).
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline">frc{teamNumber}</Badge>
          <Link href="/" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Back to dashboard
          </Link>
        </div>
      </div>

      {teamNumber === PUBLIC_CONFIG.defaultTeam ? (
        <DashboardShell />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Coming in Phase 4</CardTitle>
            <CardDescription>
              Per-team dashboards for arbitrary teams will be wired up with the video analyzer.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Change the URL to /teams/{PUBLIC_CONFIG.defaultTeam} to preview the default seed team.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
