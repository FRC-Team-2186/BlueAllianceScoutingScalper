import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TeamComparisonMatrix } from "@/components/comparison/team-comparison-matrix";
import { buttonVariants } from "@/components/ui/button";

export default function ComparePage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Multi-Team Comparison</h1>
          <p className="text-sm text-muted-foreground">
            Statbotics EPA plus cached Gemini video analysis with verified-video badges.
          </p>
        </div>
        <Link href="/" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Back to dashboard
        </Link>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Comparison Matrix</CardTitle>
          <CardDescription>
            Combines Statbotics EPA with AI Auto/Teleop/Endgame metrics from cached video analyses.
            Use the year/event selectors to compare 2025 REEFSCAPE events while 2026 data is sparse.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TeamComparisonMatrix />
        </CardContent>
      </Card>
    </div>
  );
}
