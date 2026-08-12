export interface StatboticsRecord {
  wins: number;
  losses: number;
  ties: number;
  count: number;
  winrate: number;
}

export interface StatboticsEpaSnapshot {
  current: number;
  recent: number;
  mean: number;
  max: number;
}

export interface StatboticsTeam {
  team: number;
  name: string;
  country: string | null;
  state: string | null;
  district: string | null;
  rookie_year: number;
  active: boolean;
  record: StatboticsRecord;
  norm_epa: StatboticsEpaSnapshot;
}

export interface StatboticsTeamEventEpa {
  mean: number;
  total_points?: number;
  auto?: number;
  teleop?: number;
  endgame?: number;
  [key: string]: number | undefined;
}

export interface StatboticsTeamEvent {
  team: number;
  event: string;
  year: number;
  name?: string;
  rank?: number | null;
  record?: StatboticsRecord;
  epa?: StatboticsTeamEventEpa;
  norm_epa?: StatboticsEpaSnapshot;
  awards?: string[];
  playoff?: {
    alliance?: number | null;
    result?: string | null;
  };
}

export interface StatboticsEvent {
  key: string;
  name: string;
  year: number;
  week?: number | null;
  type?: string;
  district?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  start_date?: string;
  end_date?: string;
  status?: string;
}

export interface StatboticsMatch {
  key: string;
  event: string;
  comp_level: string;
  match_number: number;
  set_number: number;
  red: number[];
  blue: number[];
  red_score?: number | null;
  blue_score?: number | null;
  winning_alliance?: string | null;
  predicted_red?: number | null;
  predicted_blue?: number | null;
}
