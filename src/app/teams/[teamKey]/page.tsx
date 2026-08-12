import { notFound } from "next/navigation";
import { TeamProfileView } from "@/components/teams/team-profile-view";

type TeamPageProps = {
  params: Promise<{ teamKey: string }>;
};

export default async function TeamPage({ params }: TeamPageProps) {
  const { teamKey } = await params;
  const teamNumber = Number(teamKey);

  if (!Number.isFinite(teamNumber) || teamNumber <= 0) {
    notFound();
  }

  return <TeamProfileView teamNumber={teamNumber} />;
}
