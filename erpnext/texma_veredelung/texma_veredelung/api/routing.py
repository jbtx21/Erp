"""Stickerei-Partner-Routing (TEXMA-Differenzierer, Kap. 5.4 — kein ERPNext-Pendant).

Neues Logo → Ausschreibung an aktive Stickerei-Partner (Request for Quotation).
Wiederholer (Logo mit bereits genehmigter Vorversion) → Direktauftrag an den zuletzt genutzten
Partner (Subcontracting Order). Die Preishoheit bleibt innen (Veredelungspreis, s. pricing.py).
"""

import frappe


def route_logo(doc, method=None):
    """doc_event (Logo.after_insert): Wiederholer direkt, neues Logo ausschreiben."""
    if getattr(doc, "ist_wiederholer", 0):
        _direct_order(doc)
    else:
        _tender(doc)


def _tender(doc) -> None:
    """Neues Logo an aktive Partner ausschreiben (Integrationspunkt → RFQ/E-Mail)."""
    partners = frappe.get_all(
        "Stickerei Partner",
        filters={"aktiv": 1},
        fields=["name", "supplier", "email"],
        order_by="prioritaet asc",
    )
    # TODO(Dienstleister): Request for Quotation je Partner anlegen bzw. Ausschreibungsmail.
    frappe.logger("texma").info(
        f"Stickerei-Ausschreibung (stub) für Logo {doc.name} an {len(partners)} Partner"
    )


def _direct_order(doc) -> None:
    """Wiederholer: Direktauftrag an den zuletzt genutzten Partner (Integrationspunkt)."""
    # TODO(Dienstleister): Subcontracting Order an doc-Partner mit aktiver Logo-Version.
    frappe.logger("texma").info(f"Stickerei-Direktauftrag (stub) für Wiederholer-Logo {doc.name}")
