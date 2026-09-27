export type ReportWindow = { start: string; end: string; week: string };
export function reportWindow(now?: Date): ReportWindow;
export function formatMetric(value: number | null | undefined): string;
export function mergeGenerated(previous: string, fresh: string): string;
export function github(args: readonly string[]): string;
export function writeWeeklyIssue(options: { repo: string; window: ReportWindow; markdown: string; checklist?: string; publish?: boolean }, run?: typeof github): string;
