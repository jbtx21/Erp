import frappe
from frappe.model.document import Document

from texma_veredelung.api.pricing import vk_from_ek


class Veredelungspreis(Document):
    def validate(self):
        # VK aus EK über Aufschlag 1,88, wenn nicht manuell gesetzt (T-08, Preishoheit innen).
        if not self.vk and self.ek:
            self.vk = vk_from_ek(self.ek)
        if self.valid_from and self.valid_upto and self.valid_from > self.valid_upto:
            frappe.throw("'Gültig ab' darf nicht nach 'Gültig bis' liegen.")
