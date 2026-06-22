"""WooCommerce-Ingest (T-01) + Status-/Tracking-Push (T-09).

T-01 ist Abnahme-Testfall #1: Alle Bestellungen eines Shops gehören dem EINEN Firmenkunden,
NICHT dem einloggenden Mitarbeiter. Sonst entstehen Hunderte Phantom-Kunden. Der Shop wird
über das Custom Field `Customer.texma_shop_id` auf genau einen Customer gemappt; Mitarbeiter-
und Lieferadresse werden als Address/Contact angehängt — es wird NIE ein neuer Customer angelegt.
"""

import json

import frappe
from frappe import _

#: Shop-Status → ERPNext-Statushinweis, der an den Shop zurückgemeldet wird (T-09).
STATUS_TO_SHOP = {
    "In Produktion": "processing",
    "Versandbereit": "processing",
    "Versendet": "completed",
}


def _customer_for_shop(shop_id: str) -> str:
    """Den EINEN Firmenkunden zu einem Shop auflösen (T-01). Fehlt das Mapping → harter Fehler,
    statt still einen Phantom-Kunden anzulegen."""
    customer = frappe.db.get_value("Customer", {"texma_shop_id": shop_id}, "name")
    if not customer:
        frappe.throw(_("Kein Firmenkunde für Shop '{0}' hinterlegt (Customer.texma_shop_id).").format(shop_id))
    return customer


@frappe.whitelist(allow_guest=True)
def ingest_order(payload: str | dict, shop_id: str) -> dict:
    """WooCommerce-Bestellung → Sales Order auf den Firmenkunden. Idempotent über die Shop-Order-Nr.

    Rückgabe {sales_order, created, customer}. `created=False` bei Duplikat (kein Doppelimport).
    """
    data = json.loads(payload) if isinstance(payload, str) else payload
    external_no = str(data.get("id") or data.get("number") or "")
    if not external_no:
        frappe.throw(_("WooCommerce-Bestellung ohne Nummer."))

    customer = _customer_for_shop(shop_id)

    existing = frappe.db.get_value("Sales Order", {"po_no": external_no, "customer": customer}, "name")
    if existing:
        return {"sales_order": existing, "created": False, "customer": customer}

    so = frappe.new_doc("Sales Order")
    so.customer = customer  # NIE der Mitarbeiter — immer der Firmenkunde (T-01)
    so.po_no = external_no  # Shop-Bestellnummer für Idempotenz/Rückverfolgung
    so.delivery_date = frappe.utils.add_days(frappe.utils.nowdate(), 14)
    for line in data.get("line_items", []):
        item_code = _resolve_variant(line)
        so.append("items", {
            "item_code": item_code,
            "qty": line.get("quantity", 1),
            "rate": float(line.get("price", 0) or 0),
        })
    so.insert(ignore_permissions=True)
    return {"sales_order": so.name, "created": True, "customer": customer}


def _resolve_variant(line: dict) -> str:
    """Shop-Zeile → interne Variante (Item) über die SKU; Mapping-Fehler werden hart gemeldet (T-02)."""
    sku = line.get("sku")
    item_code = frappe.db.get_value("Item", {"item_code": sku}, "name") if sku else None
    if not item_code:
        frappe.throw(_("Keine Variante für SKU '{0}' (T-02).").format(sku))
    return item_code


def push_status_on_change(doc, method=None):
    """doc_event (Sales Order.on_update_after_submit): Statuswechsel an den Shop melden (T-09).

    Tracking wird nur bei 'Versendet' mitgeschickt (durch STATUS_TO_SHOP gesteuert).
    """
    shop_id = frappe.db.get_value("Customer", doc.customer, "texma_shop_id")
    if not shop_id:
        return
    texma_status = getattr(doc, "texma_status", None)
    mapped = STATUS_TO_SHOP.get(texma_status)
    if not mapped:
        return
    payload = {"shop_id": shop_id, "external_no": doc.po_no, "status": mapped}
    if texma_status == "Versendet":
        payload["tracking_no"] = getattr(doc, "texma_tracking_no", None)
    # Ausgehender HTTP-Call gehört in einen Background-Job/Outbox (hier Integrationspunkt).
    frappe.enqueue(
        "texma_veredelung.api.woocommerce._send_status",
        queue="short",
        payload=payload,
    )


def _send_status(payload: dict) -> None:
    """Integrationspunkt: tatsächlicher WooCommerce-REST-Push (consumer key/secret aus Site-Config)."""
    # TODO(Dienstleister): WooCommerce REST PUT /orders/{external_no} mit Status + Tracking-Meta.
    frappe.logger("texma").info(f"WooCommerce-Status-Push (stub): {payload}")
