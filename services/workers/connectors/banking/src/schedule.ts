// Scheduler-Verdrahtung (Kap. 13/32): registriert Bank-Sync und Mahnlauf als wiederkehrende
// Connector-Jobs. Beide existieren als aufrufbare Funktionen (BankConnectionService.sync,
// DunningService.runDunning), hingen aber an keinem Cron-Trigger — hier werden sie an den
// generischen Connector-Scheduler (job-name → Intervall + Handler) angebunden. Concurrency 1
// (im Scheduler) verhindert Doppelverarbeitung; der Mahnlauf ist über die Stufen-Fortschreibung
// ohnehin idempotent.

export const BANKING_SYNC_JOB = "banking.sync";
export const DUNNING_RUN_JOB = "dunning.run";

const HOUR = 3_600_000;

export interface BankingScheduleOptions {
  /** Bank-Abruf-Intervall in ms (Default: stündlich). */
  bankSyncEveryMs?: number;
  /** Mahnlauf-Intervall in ms (Default: täglich). */
  dunningEveryMs?: number;
}

/** Liefert das Schedule-Objekt (job-name → Intervall) für `scheduleConnectorPolls`. */
export function buildBankingSchedule(opts: BankingScheduleOptions = {}): Record<string, number> {
  return {
    [BANKING_SYNC_JOB]: opts.bankSyncEveryMs ?? HOUR,
    [DUNNING_RUN_JOB]: opts.dunningEveryMs ?? 24 * HOUR,
  };
}

export interface BankingHandlerDeps {
  /** Ruft je aktiver Bank-Verbindung neue Gutschriften ab und speist sie in die Pipeline. */
  syncBankCredits: () => Promise<unknown>;
  /** Führt den Mahnlauf aus (Stufen-Fortschreibung + Mahnbelege). */
  runDunning: () => Promise<unknown>;
}

/** Liefert die Handler-Map (job-name → Runner) für `createConnectorWorker`. */
export function buildBankingHandlers(deps: BankingHandlerDeps): Record<string, () => Promise<unknown>> {
  return {
    [BANKING_SYNC_JOB]: () => deps.syncBankCredits(),
    [DUNNING_RUN_JOB]: () => deps.runDunning(),
  };
}
