import { MatchAnalysisView } from "@/components/matches/match-analysis-view";
import { PUBLIC_CONFIG } from "@/lib/config/public";

type MatchPageProps = {
  params: Promise<{ matchKey: string }>;
  searchParams: Promise<{ team?: string }>;
};

export default async function MatchPage({ params, searchParams }: MatchPageProps) {
  const { matchKey } = await params;
  const { team } = await searchParams;
  const teamKey = team ? `frc${team}` : `frc${PUBLIC_CONFIG.defaultTeam}`;

  return <MatchAnalysisView matchKey={matchKey} teamKey={teamKey} />;
}
