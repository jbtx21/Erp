// Wiederverwendbare, deklarative Zustandsmaschine (Kap. 35). Verallgemeinert das
// Muster aus subproduction.ts: erlaubte Übergänge als Tabelle, Guard + Fehler bei
// unerlaubtem Wechsel. Rein/IO-frei. Vorbild: ERPNext-Workflow / Odoo `state`.

export class StateTransitionError extends Error {
  constructor(
    public readonly from: string,
    public readonly to: string,
    public readonly machine: string
  ) {
    super(`Übergang ${from} → ${to} nicht erlaubt (${machine}).`);
    this.name = "StateTransitionError";
  }
}

export interface StateMachine<S extends string> {
  readonly name: string;
  /** Alle bekannten Zustände. */
  readonly states: ReadonlyArray<S>;
  /** Erlaubte Folgezustände eines Zustands. */
  next(from: S): ReadonlyArray<S>;
  /** Ob der Übergang from→to erlaubt ist. */
  can(from: S, to: S): boolean;
  /** Gibt `to` zurück, wirft `StateTransitionError` bei unerlaubtem Übergang. */
  assert(from: S, to: S): S;
  /** Endzustand (keine Folgezustände)? */
  isFinal(state: S): boolean;
}

/** Baut eine Zustandsmaschine aus einer Übergangstabelle. */
export function defineMachine<S extends string>(
  name: string,
  transitions: Record<S, ReadonlyArray<S>>
): StateMachine<S> {
  const states = Object.keys(transitions) as S[];
  return {
    name,
    states,
    next: (from) => transitions[from] ?? [],
    can: (from, to) => (transitions[from] ?? []).includes(to),
    assert(from, to) {
      if (!(transitions[from] ?? []).includes(to)) {
        throw new StateTransitionError(from, to, name);
      }
      return to;
    },
    isFinal: (state) => (transitions[state] ?? []).length === 0,
  };
}
