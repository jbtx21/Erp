// „Ungespeicherte Änderungen"-Schutz (P0): warnt vor Datenverlust, wenn ein Editor mit
// dirty state verlassen wird. Zwei Wege: (1) beforeunload für Browser-Schließen/Neuladen/
// URL-Wechsel; (2) Abfangen des Hash-Wechsels (In-App-Navigation/Sidebar) mit Confirm —
// bei Ablehnung wird der vorige Hash wiederhergestellt.
import { useEffect } from "react";
import { confirmDialog } from "./ui-kit.js";

export function useUnsavedGuard(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;

    const onBeforeUnload = (e: BeforeUnloadEvent): void => {
      e.preventDefault();
      e.returnValue = ""; // Standard-Browserdialog erzwingen
    };
    window.addEventListener("beforeunload", onBeforeUnload);

    // In-App-Navigation (Hash) abfangen: das Ziel merken, SOFORT auf den vorigen Hash
    // zurückspringen und dann asynchron (Mantine-Modal) bestätigen. Bei „Verlassen" wird
    // das Ziel angewandt, sonst bleibt der Editor stehen.
    let lastHash = window.location.hash;
    let guarding = false;
    const onHashChange = (): void => {
      if (window.location.hash === lastHash || guarding) return;
      const target = window.location.hash;
      guarding = true;
      window.location.hash = lastHash; // synchron zurück (löst ein hashchange aus → früher Early-Return)
      void confirmDialog({ title: "Ungespeicherte Änderungen", message: "Es gibt ungespeicherte Änderungen. Diese Ansicht wirklich verlassen?", confirmLabel: "Verlassen", danger: true }).then((ok) => {
        guarding = false;
        if (ok) { lastHash = target; window.location.hash = target; }
      });
    };
    window.addEventListener("hashchange", onHashChange);

    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("hashchange", onHashChange);
    };
  }, [dirty]);
}
