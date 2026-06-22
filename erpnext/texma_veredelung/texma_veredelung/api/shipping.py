"""DPD-Label + Tracking-Rückschreibung (T-06).

Beim Submit eines Delivery Note wird ein DPD-Label angefordert und die Tracking-Nummer am
Beleg gespeichert; den eigentlichen Status-Push an den Shop übernimmt die Sales-Order-Logik (T-09).
"""

import frappe


def request_dpd_label(doc, method=None):
    """doc_event (Delivery Note.on_submit): DPD-Label anfordern, Tracking zurückschreiben."""
    if getattr(doc, "texma_tracking_no", None):
        return  # bereits versandt
    label = _create_dpd_label(doc)
    if label.get("tracking_no"):
        doc.db_set("texma_tracking_no", label["tracking_no"])


def _create_dpd_label(doc) -> dict:
    """Integrationspunkt: DPD-REST-Aufruf aus der Lieferadresse. Liefert {tracking_no, label_pdf}."""
    # TODO(Dienstleister): DPD Shipping API mit Empfängeradresse (doc.shipping_address_name).
    frappe.logger("texma").info(f"DPD-Label (stub) für Delivery Note {doc.name}")
    return {"tracking_no": None, "label_pdf": None}
