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
            Statbotics EPA breakdown (total/auto/teleop/endgame) plus Gemini
            visual classification (drivetrain, shooter type, endgame mechanism).
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
            Statbotics uses epa.breakdown.*_points (never alliance÷3). Pending
            Gemini features show as Analyzing… / TBD. Use Force Refresh or
            <code className="mx-1 rounded bg-muted px-1">?force=true</code>
            to re-run analysis.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TeamComparisonMatrix />
        </CardContent>
      </Card>
    </div>
  );
}
