from frappe.model.document import Document


class Logo(Document):
    def validate(self):
        # Wiederholer = es gibt mindestens eine genehmigte Version → Direktauftrag statt Ausschreibung.
        approved = [v for v in (self.versions or []) if getattr(v, "aktiv", 0)]
        self.ist_wiederholer = 1 if len(self.versions or []) > 1 or approved else 0
        if approved:
            self.aktive_version = max(int(v.version or 0) for v in approved)
