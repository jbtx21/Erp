-- Konkrete Anfrage-Positionen am CRM-Eintrag (Mehr-Positionen-Erfassung wie im Angebot,
-- inkl. Freitext auf Artikel-/Veredelungsebene). JSONB; beim Überführen → echte QuoteLines.
ALTER TABLE "CrmLead" ADD COLUMN "lines" JSONB;
