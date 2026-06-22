"""Veredelungspreise: EK→VK-Aufschlag 1,88 + kundenindividuelle Preise (T-08, Preishoheit innen).

Die Preishoheit liegt INNEN: kundenindividuelle Veredelungspreise schlagen den Standardpreis,
und der VK ergibt sich aus dem EK über den hinterlegten Aufschlagsfaktor (Lastenheft Kap. 4:
„Stick-EK manuell → VK über Aufschlagsfaktor 1,88"). Beträge als Frappe-Currency (EUR).
"""

import frappe

#: Aufschlagsfaktor EK→VK (Lastenheft Kap. 4). Konfigurierbar über Texma Settings (optional).
DEFAULT_MARKUP = 1.88


def markup_factor() -> float:
    """Aufschlagsfaktor — überschreibbar via Single 'Texma Settings', sonst Default 1,88."""
    value = frappe.db.get_single_value("Texma Settings", "veredelung_markup") if frappe.db.exists(
        "DocType", "Texma Settings"
    ) else None
    return float(value) if value else DEFAULT_MARKUP


def vk_from_ek(ek: float) -> float:
    """VK aus EK über den Aufschlagsfaktor, auf 2 Nachkommastellen gerundet."""
    return round((ek or 0.0) * markup_factor(), 2)


def apply_markup(doc, method=None):
    """doc_event (Veredelungspreis.before_save): VK automatisch aus EK, wenn nicht manuell gesetzt."""
    if getattr(doc, "vk", None) in (None, 0) and getattr(doc, "ek", None):
        doc.vk = vk_from_ek(doc.ek)


@frappe.whitelist()
def resolve_finishing_price(customer: str, finishing_type: str, qty: int = 1) -> dict:
    """Wirksamen Veredelungs-VK auflösen: kundenindividuell vor Standard, Mengenstaffel beachtet.

    Präzedenz (wie im Greenfield `pricing.ts`): Kunde > Standard. Innerhalb dessen die höchste
    `min_menge`, die <= qty ist. Gibt {vk, source} zurück; ohne Treffer source='none'.
    """
    qty = int(qty or 1)
    rows = frappe.get_all(
        "Veredelungspreis",
        filters={
            "finishing_type": finishing_type,
            "min_menge": ["<=", qty],
            "customer": ["in", [customer, ""]],
        },
        fields=["customer", "vk", "min_menge"],
    )
    if not rows:
        return {"vk": None, "source": "none"}

    # Kundenindividuell schlägt Standard; danach größte passende Mengenstaffel.
    rows.sort(key=lambda r: (r.get("customer") == customer, r.get("min_menge") or 0), reverse=True)
    best = rows[0]
    return {"vk": best["vk"], "source": "customer" if best.get("customer") == customer else "standard"}
