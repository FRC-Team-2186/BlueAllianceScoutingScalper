export type AllianceColor = "red" | "blue" | "";

export type CompLevel = "qm" | "ef" | "qf" | "sf" | "f";

export interface TbaMatchVideo {
  type: "youtube" | "tba";
  key: string;
}

export interface TbaMatchAllianceTeam {
  team_key: string;
  dq?: boolean | null;
  surrogate?: boolean | null;
}

export interface TbaMatchAlliance {
  score: number;
  team_keys: string[];
  surrogate_team_keys?: string[];
  dq_team_keys?: string[];
}

export interface TbaMatch {
  key: string;
  comp_level: CompLevel;
  set_number: number;
  match_number: number;
  alliances: {
    red: TbaMatchAlliance;
    blue: TbaMatchAlliance;
  };
  winning_alliance: AllianceColor;
  event_key: string;
  time: number | null;
  actual_time: number | null;
  predicted_time: number | null;
  post_result_time: number | null;
  score_breakdown: Record<string, unknown> | null;
  videos: TbaMatchVideo[];
}

export interface TbaTeam {
  key: string;
  team_number: number;
  nickname: string;
  name: string;
  school_name: string | null;
  city: string | null;
  state_prov: string | null;
  country: string | null;
  website: string | null;
  rookie_year: number;
  motto: string | null;
}

export interface TbaEvent {
  key: string;
  name: string;
  event_code: string;
  event_type: number;
  district?: {
    key: string;
    display_name: string;
  } | null;
  city: string | null;
  state_prov: string | null;
  country: string | null;
  start_date: string;
  end_date: string;
  year: number;
  week?: number | null;
}

export interface TbaTeamEventStatus {
  team_key: string;
  event_key: string;
  alliance?: {
    name: string;
    pick: number;
  } | null;
  playoff?: {
    level: string;
    record: {
      wins: number;
      losses: number;
      ties: number;
    };
    status: string;
  } | null;
  qual?: {
    ranking: number;
    record: {
      wins: number;
      losses: number;
      ties: number;
    };
    sort_orders: Array<{ name: string; precision: number; value: number }>;
    status: string;
  } | null;
}

export interface TbaEventTeam {
  team_key: string;
  event_key: string;
  rank: number | null;
  dq: boolean;
  nickname: string;
}
