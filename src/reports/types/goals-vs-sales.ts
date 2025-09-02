export interface GoalsVsSalesSeriesItem {
  date: string; // YYYY-MM-DD or YYYY-MM
  realized: number;
  goal: number;
  superGoal: number;
}

export interface GoalsVsSalesTotals {
  realized: number;
  goal: number;
  superGoal: number;
}

export interface GoalsVsSalesResult {
  series: GoalsVsSalesSeriesItem[];
  totals: GoalsVsSalesTotals;
}
