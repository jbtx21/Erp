import { describe, expect, it } from "vitest";
import { BANKING_SYNC_JOB, DUNNING_RUN_JOB, buildBankingHandlers, buildBankingSchedule } from "./schedule.js";

describe("Banking-Scheduler-Verdrahtung", () => {
  it("baut ein Schedule mit Bank-Sync (stündlich) + Mahnlauf (täglich)", () => {
    const s = buildBankingSchedule();
    expect(s[BANKING_SYNC_JOB]).toBe(3_600_000);
    expect(s[DUNNING_RUN_JOB]).toBe(24 * 3_600_000);
  });

  it("übernimmt Intervall-Overrides", () => {
    expect(buildBankingSchedule({ bankSyncEveryMs: 60_000 })[BANKING_SYNC_JOB]).toBe(60_000);
  });

  it("verdrahtet die Handler auf die injizierten Runner", async () => {
    const calls: string[] = [];
    const handlers = buildBankingHandlers({
      syncBankCredits: async () => { calls.push("sync"); return 3; },
      runDunning: async () => { calls.push("dunning"); return 1; },
    });
    expect(await handlers[BANKING_SYNC_JOB]!()).toBe(3);
    expect(await handlers[DUNNING_RUN_JOB]!()).toBe(1);
    expect(calls).toEqual(["sync", "dunning"]);
  });
});
