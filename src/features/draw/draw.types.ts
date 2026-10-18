import { t } from "elysia";
export type DrawOutcome = "drawn" | "closed_no_entries" | "skipped";

export interface DrawResult {
  raffleId: string;
  outcome: DrawOutcome;
  winningTicketId: string | null;
  winnerUserId: string | null;
}

export interface IDrawService {
  /** Safe to call repeatedly. */
  runDueDraws(): Promise<DrawResult[]>;
  drawRaffle(raffleId: string): Promise<DrawResult>;
}

export interface IDrawScheduler {
  start(): void;
  stop(): void;
  isRunning(): boolean;
}

// --- HTTP schemas -----------------------------------------------------------

export const DrawResultSchema = t.Object({
  raffleId: t.String(),
  outcome: t.Union([
    t.Literal("drawn"),
    t.Literal("closed_no_entries"),
    t.Literal("skipped"),
  ]),
  winningTicketId: t.Nullable(t.String()),
  winnerUserId: t.Nullable(t.String()),
});
