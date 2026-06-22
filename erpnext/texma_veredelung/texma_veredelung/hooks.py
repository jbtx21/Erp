app_name = "texma_veredelung"
app_title = "Texma Veredelung"
app_publisher = "TEXMA Textilveredelung GmbH"
app_description = "TEXMA-Differenzierer als Frappe-Custom-App neben ERPNext-Standard."
app_email = "info@texma-gmbh.de"
app_license = "MIT"

# ── Dokument-Events: TEXMA-Regeln an Standard-DocTypes andocken ──────────────────
# Nie ERPNext patchen — nur über doc_events erweitern (upgrade-sicher).
doc_events = {
    "Veredelungspreis": {
        # EK→VK-Aufschlag 1,88 automatisch, wenn VK nicht manuell gesetzt (T-08).
        "before_save": "texma_veredelung.api.pricing.apply_markup",
    },
    "Sales Order": {
        # Statuswechsel an den Shop zurückmelden (≥ In Produktion/Versandbereit/Versendet, T-09).
        "on_update_after_submit": "texma_veredelung.api.woocommerce.push_status_on_change",
    },
    "Delivery Note": {
        # Beim Versand DPD-Label anfordern und Tracking zurückschreiben (T-06).
        "on_submit": "texma_veredelung.api.shipping.request_dpd_label",
    },
    "Logo": {
        # Neues Logo → Ausschreibung an Stickerei-Partner; Wiederholer → Direktauftrag.
        "after_insert": "texma_veredelung.api.routing.route_logo",
    },
}

# ── Custom Fields an Standard-DocTypes (als Fixtures mitgeliefert) ───────────────
fixtures = [
    {
        "doctype": "Custom Field",
        "filters": [["name", "in", [
            "Customer-texma_shop_id",
            "Customer-texma_mahnsperre",
            "Item-texma_default_bom",
            "Supplier-texma_ist_veredler",
        ]]],
    },
]
