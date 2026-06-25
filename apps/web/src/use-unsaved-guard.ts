// „Ungespeicherte Änderungen"-Schutz (P0): warnt vor Datenverlust, wenn ein Editor mit
// dirty state verlassen wird. Zwei Wege: (1) beforeunload für Browser-Schließen/Neuladen/
// URL-Wechsel; (2) Abfangen des Hash-Wechsels (In-App-Navigation/Sidebar) mit Confirm —
// bei Ablehnung wird der vorige Hash wiederhergestellt.
import { useEffect } from "react";

export function useUnsavedGuard(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;

    const onBeforeUnload = (e: BeforeUnloadEvent): void => {
      e.preventDefault();
      e.returnValue = ""; // Standard-Browserdialog erzwingen
    };
    window.addEventListener("beforeunload", onBeforeUnload);

    // In-App-Navigation (Hash) abfangen: bei dirty einen Bestätigungsdialog zeigen und
    // den Hash zurücksetzen, wenn der Nutzer bleiben will.
    let lastHash = window.location.hash;
    const onHashChange = (): void => {
      if (window.location.hash === lastHash) return;
      const ok = window.confirm("Es gibt ungespeicherte Änderungen. Diese Ansicht wirklich verlassen?");
      if (ok) { lastHash = window.location.hash; return; }
      // Bleiben: vorigen Hash ohne erneutes Event wiederherstellen.
      window.removeEventListener("hashchange", onHashChange);
      window.location.hash = lastHash;
      setTimeout(() => window.addEventListener("hashchange", onHashChange), 0);
    };
    window.addEventListener("hashchange", onHashChange);

    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("hashchange", onHashChange);
    };
  }, [dirty]);
}
