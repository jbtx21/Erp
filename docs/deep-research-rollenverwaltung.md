# Deep Research — Rollen-/Berechtigungsverwaltung in führenden ERP-Systemen

> Adversarial verifizierter Research-Report (110 Agents, 3-Voter-Verifikation je Claim).
> Frage: Wie setzen ERPNext, Odoo 18, SAP S/4HANA, Dynamics 365 BC, Xentral, weclapp, Katana
> Rollenmodelle, Granularität (Modul/Beleg/Feld/Datensatz), UI-Verwaltbarkeit, Approval und
> Delegation um — und was übernimmt TEXMA (heute: 4 Code-Rollen, roleProcedure, redactOrderForRole)?

## Zusammenfassung

Von den sieben angefragten Systemen überlebten nur ERPNext (Frappe v15) und Odoo 18 die adversariale Verifikation — beide zeigen dasselbe Grundmuster: Berechtigungen sind Daten, nicht Code. ERPNext kombiniert drei deklarative Schichten: Rollen×DocType×Aktion (read/write/create/submit/cancel/amend/print/export …) im UI-verwaltbaren Role Permissions Manager, Feld-Ebene über Permission Levels (Feldgruppen 0–9 mit eigenen Rollenregeln — das deklarative Pendant zu TEXMAs redactOrderForRole) und Datensatz-Ebene über User Permissions (Link-Feld-basierte Record Rules mit Propagation über verknüpfte Belege, z. B. Company/Territory/Customer). Odoo 18 trennt additive, default-deny Modell-ACLs (ir.model.access je Gruppe), default-allow Record Rules (ir.rule mit Domain-Ausdrücken), serverseitig erzwungene Feld-Gruppen und Gruppen-Vererbung via implies — alles als Datensätze ausgeliefert und im Admin-UI inspizier-/verwaltbar. Für TEXMA folgt daraus: die vier Code-Rollen als Basis behalten (Odoo zeigt, dass Code-definierte Defaults legitim sind), aber (1) redactOrderForRole zu einem deklarativen Feld-Level-Mechanismus verallgemeinern, (2) Datensatz-Regeln als eigene, rollenunabhängige Schicht denken — die sich sauber auf die Postgres-RLS-Arbeit aus ADR 0004 abbilden lässt (Odoos Domain-Rules bzw. ERPNexts Company-User-Permission sind genau dieses Muster), (3) additive Default-Deny-Semantik übernehmen und (4) mittelfristig eine UI-verwaltbare Rollen-Rechte-Matrix (Rolle×Router/Belegtyp×Aktion) mit Code-Defaults plus DB-Overrides einführen statt neuer hartkodierter roleProcedure-Varianten.

## Verifizierte Findings

### F1 · Konfidenz high · Votum 3-0 (Claims 0, 6, 13 zusammengeführt)

ERPNext/Frappe: RBAC mit Mehrfachrollen pro User und feingranularen, belegstadium-bezogenen Aktionsrechten je DocType. Ein User kann beliebig viele Rollen halten; jede Rollen-Regel gilt pro DocType (Belegtyp) und deckt nicht nur CRUD ab, sondern auch Submit/Cancel/Amend (Dokument-Lebenszyklus) sowie Print, Email, Import/Export, Report und Share. Freigabe-Szenarien werden u. a. über rollenspezifische Schreibrechte auf Status-Felder abgebildet (Beispiel Leave Application: Status-Feld auf Level 1, nur HR User/Leave Approver schreibberechtigt). Für TEXMA relevant: Das Aktions-Vokabular (submit/cancel/amend statt nur read/write) passt gut zu GoBD-Belegen mit Append-only-Korrekturen.

**Beleg:** Verifiziert gegen Frappe-v15-Code: permissions.py definiert rights = (select, read, write, create, delete, submit, cancel, amend, print, email, report, import, export, share) als Checkboxen je Rollen-Regel im DocPerm; user.json enthält die 'Has Role'-Kindtabelle für Mehrfachrollen. Docs: 'Permissions are applied on each stage of the document like Creation, Saving, Submission, Cancellation, and Amendment.' Minor caveat: das Recht 'Set User Permissions' als DocPerm-Checkbox wurde in v15 entfernt.

**Quellen:** https://docs.frappe.io/framework/user/en/basics/users-and-permissions · https://docs.frappe.io/erpnext/role-based-permissions · https://docs.frappe.io/erpnext/user/manual/en/users-and-permissions · https://github.com/frappe/frappe (version-15: permissions.py rights-Tupel, docperm.json, user.json)

### F2 · Konfidenz high · Votum 3-0 (Claims 3, 16 zusammengeführt)

ERPNext: Rollen sind UI-verwaltbare Stammdaten mit zweistufigem Modell (Code-Defaults + UI-Override), nicht Code-Konstanten. Rollen sind Records des DocTypes 'Role' (inkl. Desk-Access-Flag und 2FA je Rolle); eigene Rollen werden im UI angelegt. Apps liefern Default-Permissions je DocType bei Installation mit, Administratoren überschreiben sie vollständig im Role Permissions Manager (Custom DocPerm überlagert Standard-DocPerm, mit 'Restore Original Permissions'). 'Role Profiles' bündeln mehrere Rollen als wiederverwendbare Vorlage für die User-Anlage. Das ist die direkte Blaupause für TEXMAs Weg von hartkodierten Rollen zu kundenspezifischer Konfiguration: Code-Defaults behalten, DB-Overrides ermöglichen.

**Beleg:** Frappe-v15-Quellcode bestätigt: Role ist ein DocType mit is_custom-, desk_access- und two_factor_auth-Feldern; Role Profile bündelt eine roles-Kindtabelle und ist am User verlinkt. Docs: 'DocTypes can have a default set of Roles applied when you install your app. […] Role Permissions Manager […] The default set of permissions show up here and can be overridden.' Caveat: has_permission-Server-Hooks bleiben Code-seitig außerhalb des Managers.

**Quellen:** https://docs.frappe.io/framework/user/en/basics/users-and-permissions · https://docs.frappe.io/erpnext/user/manual/en/users-and-permissions · https://github.com/frappe/frappe (version-15: role.json, role_profile.json, user.json)

### F3 · Konfidenz high · Votum 3-0 (Claims 1, 4, 10, 11, 12, 14 zusammengeführt)

ERPNext: Feld-Ebene über 'Permission Levels' — deklarative Feld-Redaktion ohne Code. Felder eines DocTypes werden Level-Gruppen 0–9 zugeordnet (Standard 0, gesetzt per Customize Form im UI); pro (DocType, Rolle, Perm Level) wird im Role Permission Manager eine eigene Regel mit Zugriffsart (z. B. nur Read) angelegt. Beispiel aus den Docs: Item-Rate/Preisfelder auf Level 2, nur bestimmte Rollen lesen sie. Das ist exakt das deklarative Gegenstück zu TEXMAs redactOrderForRole (Preis-Redaktion für PRODUKTION) — statt einer handgeschriebenen Redaktionsfunktion pro Fall eine Feld→Level→Rolle-Konfiguration.

**Beleg:** 'In each document, you can group fields by levels. Each group of fields is denoted by a unique number (0 to 9). A separate set of permission rules can be applied to each field group. By default, all fields are of level 0.' Konfiguration in zwei UI-Schritten (Customize Form + Role Permission Manager). Wichtiger Warnhinweis für TEXMA: frappe/erpnext Issue #16388 dokumentiert, dass Permlevel-Read-Restriktionen historisch in Listen-/Report-Queries nicht konsistent erzwungen wurden — deklarative Feldrechte müssen auch im Query-Pfad durchgesetzt werden, nicht nur in der Detail-Ansicht.

**Quellen:** https://docs.frappe.io/framework/user/en/basics/users-and-permissions · https://docs.frappe.io/erpnext/role-based-permissions · https://docs.frappe.io/erpnext/changing-the-properties-of-a-field-based-on-role · https://docs.frappe.io/erpnext/user/manual/en/managing-perm-level

### F4 · Konfidenz high · Votum 3-0 (Claims 2, 5, 7, 8, 9, 15 zusammengeführt)

ERPNext: Datensatz-Ebene über 'User Permissions' — eigene, rollenunabhängige Schicht mit Link-Feld-Propagation. Rollen gewähren (standardmäßig vollständigen) Zugriff auf einen ganzen DocType; User Permissions grenzen diesen pro User auf konkrete Datensätze anhand von Link-Feld-Werten ein (z. B. nur eine Company, ein Territory, ein Customer). Die Einschränkung vererbt sich über Link-Felder auf verknüpfte Belege (Customer-Link in Sales Order/Quotation), ist per 'Applicable For' auf DocTypes begrenzbar und per 'Ignore User Permissions' feldweise ausnehmbar; 'Is Default' belegt den Wert in neuen Transaktionen vor. Vollständig UI-verwaltet (User-Permissions-Liste → New). Der Company-Fall ist mandanten-analoge Sichtbarkeit — konzeptionell das, was TEXMA mit Postgres RLS (ADR 0004) härter (DB-seitig) umsetzt.

**Beleg:** 'Role based permissions allow setting complete (by default) access to a document type […] User Permissions can be used to restrict access to select documents based on the link fields in the document. […] User Permissions defined for other Document Types also get applied if they are related to the current Document Type through Link Fields.' Explizite Anwendungsfälle laut Docs: 'Allowing user to access data belonging to one Company' und Territory/Customer-Einschränkung für Sales User. Wichtig: ERPNexts Company-Trennung ist nur Sichtbarkeits-, keine echte Mandantentrennung (eine geteilte DB).

**Quellen:** https://docs.frappe.io/framework/user/en/basics/users-and-permissions · https://docs.frappe.io/erpnext/user-permissions · https://docs.frappe.io/erpnext/role-based-permissions · https://docs.frappe.io/erpnext/user/manual/en/users-and-permissions

### F5 · Konfidenz high · Votum 3-0 (Claim 17)

Odoo 18: Rollen ('groups') sind Datensätze (res.groups) mit Vererbung via 'implies'; Zuweisung im Admin-UI. Gruppen werden als Modul-Stammdaten (Data Files) ausgeliefert, aber über Settings → Manage Users an User vergeben. Vererbung: eine Manager-Gruppe impliziert die User-Gruppe (implied_ids), Manager erben automatisch alle Rechte der Basisgruppe. Für TEXMA das Referenzmuster für Rollen-Hierarchien: statt in jedem roleProcedure ADMIN mit aufzuzählen, könnte eine implies-Relation (ADMIN ⊃ BUERO usw.) die Vererbung zentral definieren.

**Beleg:** 'A group is no more than a record of the res.groups model. They are normally part of a module's master data […] The estate_group_manager group needs to imply estate_group_user.' UI-Zuweisung: 'Go to Settings → Manage Users […] Set the admin user to be a Real Estate manager.' Hinweis: Die Group/Privilege-Restrukturierung kommt erst mit Odoo 19; für 18.0 gilt das beschriebene Modell.

**Quellen:** https://www.odoo.com/documentation/18.0/developer/tutorials/restrict_data_access.html · https://github.com/odoo/documentation (branch 18.0, restrict_data_access.rst)

### F6 · Konfidenz high · Votum 3-0, 3-0, 3-0, 2-1 (Claims 18, 21, 22, 23 zusammengeführt; der Daten-Datei-Aspekt war 2-1)

Odoo 18: Modell-ACLs (ir.model.access) sind rein additive, default-deny Permission-Sets je Gruppe — und komplett als Daten ausgeliefert. Jede ACL bindet ein Modell an eine Gruppe (oder keine = global) mit CRUD-Flags (create/read/write/unlink). Rechte sind die Vereinigung über alle Gruppen des Users; sie können nur gewähren, nie entziehen; ohne passende ACL hat ein User keinen Zugriff (Odoo loggt beim Modul-Load eine Warnung für Modelle ohne ACL). Die gesamte Sicherheitskonfiguration liegt in CSV/XML-Datendateien (security-Ordner, __manifest__.py) und landet als DB-Records, die im Admin-UI inspizier- und verwaltbar sind — im Kontrast zu TEXMAs compile-time roleProcedure-Gates. Additive Default-Deny-Semantik ist das robusteste übernehmbare Prinzip: nie 'alles außer X', immer explizite Grants pro Rolle.

**Beleg:** 'Access rights can only give access, they can't remove it: when access is checked, the system looks to see if any access right associated with the user (via any group) grants that access. […] If no access right applies to a user, they are not granted access (default-deny).' Referenzdoku: 'Access rights are additive, a user's accesses are the union of the accesses they get through all their groups.' Log-Warnung bei fehlender ACL wörtlich bestätigt. Caveats: superuser/sudo() umgehen ACLs; Feld-groups stehen in Python, nicht in Datendateien.

**Quellen:** https://www.odoo.com/documentation/18.0/developer/tutorials/restrict_data_access.html · https://www.odoo.com/documentation/18.0/developer/tutorials/server_framework_101/04_securityintro.html · https://www.odoo.com/documentation/18.0/developer/reference/backend/security.html

### F7 · Konfidenz high · Votum 3-0 (Claim 19)

Odoo 18: Record Rules (ir.rule) = deklarative Domain-Ausdrücke pro Datensatz und Operation, default-allow. Record Rules werden nach den ACLs record-weise ausgewertet (perm_read/write/create/unlink separat schaltbar), z. B. Agents sehen nur Datensätze mit user_id = eigener User oder leer. Anders als ACLs sind sie default-allow: greift keine Regel, ist die Operation erlaubt — die Docs warnen explizit vor Nebenwirkungen zu permissiver ACLs. Globale Regeln verknüpfen sich mit AND, Gruppenregeln mit OR. Für TEXMA/ADR 0004: Odoos Domain-Rules sind das Anwendungsschicht-Pendant zu Postgres-RLS-Policies; TEXMA kann die Semantik (Regel = Prädikat je Operation) direkt in RLS-Policies gießen und ist damit sogar strenger (DB-erzwungen statt ORM-erzwungen).

**Beleg:** 'Record rules provide that precision: they can grant or reject access to individual records […] If no rule is defined or applies to a model and operation, then the operation is allowed (default-allow), this can have odd effects if access rights are not set up correctly (are too permissive).' Referenz: Rules sind ir.rule-Records mit Domain-Prädikat, 'evaluated record-by-record, following access rights'.

**Quellen:** https://www.odoo.com/documentation/18.0/developer/tutorials/restrict_data_access.html · https://www.odoo.com/documentation/18.0/developer/reference/backend/security.html

### F8 · Konfidenz high · Votum 3-0 (Claim 20)

Odoo 18: Feld-Ebene-Sicherheit ist serverseitig erzwungen und strikt von UI-Sichtbarkeit getrennt. Ein groups-Attribut am Modell-Feld (Python) ist ein Sicherheitsfeature: User außerhalb der Gruppe können das Feld überhaupt nicht abrufen — auch nicht via RPC; das Feld wird aus Views und fields_get() entfernt, expliziter Read/Write wirft AccessError. groups auf View-Elementen, Menüs oder Actions ist dagegen nur Sichtbarkeit und verhindert den Datenzugriff nicht. Direkte Lehre für TEXMA: redactOrderForRole macht es bereits richtig (Redaktion im API-Response, nicht im Frontend); dieses Prinzip — Feldschutz gehört in die Serialisierungs-/Query-Schicht, nie nur ins UI — sollte als harte Regel für alle künftigen Feldrechte festgeschrieben werden.

**Beleg:** 'Groups on model fields (in Python) are a security feature, users outside the group will not be able to retrieve the field, or even know it exists. […] Groups on view elements (in XML) are a visibility feature, users outside the group […] will otherwise be able to interact with the object (including that field).' Referenzdoku bestätigt ORM-seitige Durchsetzung: 'restricted fields are removed from requested views, are removed from fields_get() responses, and attempts to (explicitly) read from or write to restricted fields result in access errors.'

**Quellen:** https://www.odoo.com/documentation/18.0/developer/tutorials/restrict_data_access.html · https://www.odoo.com/documentation/18.0/developer/reference/backend/security.html

### F9 · Konfidenz medium · Votum abgeleitete Synthese (keine eigene Verifikation; basiert auf den 3-0-Findings oben plus Projektkontext CLAUDE.md/ADR 0004)

Synthese/Empfehlung für TEXMA: gestufte Übernahme statt Framework-Nachbau. (1) Kurzfristig: additive Default-Deny-Semantik und implies-Rollenvererbung im bestehenden roleProcedure-Modell verankern; redactOrderForRole zu einer deklarativen Feld→Sichtbarkeitsstufe→Rolle-Map (Permlevel-Muster) verallgemeinern, zentral in packages/shared, erzwungen in der API-Serialisierung inkl. Listen-Queries. (2) Mittelfristig: Datensatz-Regeln als eigene Schicht (Owner-/Bereichs-Prädikate), umgesetzt als Postgres-RLS-Policies gemäß ADR 0004 — damit ist TEXMA strenger als beide Vorbilder, deren Record Rules nur ORM-seitig greifen. (3) Erst bei echtem Bedarf: UI-Rollenverwaltung nach dem Zwei-Stufen-Muster (Code-Defaults + DB-Overrides, Role-Profile-artige Bündel) — für 4 Rollen und ein Team dieser Größe hat sie geringe Priorität, aber das Datenmodell (Rolle×Prozedur/Belegtyp×Aktion als Tabelle) sollte jetzt so geschnitten werden, dass sie nachrüstbar bleibt. Jede Rechteänderung selbst gehört in den GoBD-Audit-Trail (buildEntry), was keines der untersuchten Systeme so explizit vorschreibt.

**Beleg:** Beide verifizierten Systeme konvergieren auf dieselbe Schichtung (Belegtyp-Rechte je Rolle/Gruppe → Feld-Ebene → Datensatz-Ebene, alles datengetrieben mit Code-Defaults). TEXMAs Bestand (roleProcedure, redactOrderForRole, RLS-Vorhaben) deckt je eine primitive Form jeder Schicht ab; die Empfehlung ordnet die verifizierten Muster den vorhandenen Nähten zu. Als Empfehlung ist dies Bewertung, nicht Faktenbehauptung, daher medium.

**Quellen:** Synthese aus den obigen Findings · /home/user/Erp/CLAUDE.md · docs/adr/0004 (Postgres-RLS-Mandantenfähigkeit, laut Aufgabenstellung im Aufbau)

## Einschränkungen (Caveats)

Abdeckungslücke: Von den sieben angefragten Systemen überlebten nur ERPNext- und Odoo-Claims die 3-Voter-Verifikation — zu SAP S/4HANA (PFCG-Rollen/Berechtigungsobjekte), Dynamics 365 BC (Permission Sets/Security Groups), Xentral, weclapp und Katana liegen keine verifizierten Findings vor; der Vergleich 'führende ERP-Systeme' stützt sich also auf zwei Open-Source-Systeme. Ebenfalls unbeantwortet blieben drei Teilfragen der ursprünglichen Frage: Vertretungs-/Delegationsregeln, dedizierte Freigabe-Workflow-Engines (Frappe Workflow, Odoo-Approvals wurden nicht verifiziert; nur das Permlevel-Statusfeld-Muster ist belegt) und Mandanten-übergreifende Rollen (nur ERPNexts Company-Sichtbarkeits-Einschränkung ist belegt, die keine echte Mandantentrennung ist). Quellenlage: fast ausschließlich Hersteller-Primärdoku plus Quellcode-Verifikation (Frappe v15, odoo/documentation 18.0) — stark für Mechanik-Beschreibungen, aber ohne unabhängige Praxisbewertung; docs.frappe.io und odoo.com waren nur über Suchindizes/GitHub-Spiegel erreichbar (Proxy-403), die Verifizierer haben Wortlaute aber gegen Code bzw. Doku-Repos bestätigt. Zeitsensitivität: Odoo 19 restrukturiert das Gruppen-/Privilege-Modell (Findings gelten für 18.0); in Frappe v15 wurde das 'Set User Permissions'-Recht entfernt. Bekannte Enforcement-Lücke: ERPNext-Permlevel-Leserechte wurden in Listen-/Report-Queries historisch nicht konsistent erzwungen (Issue #16388) — Warnung für TEXMAs eigene Umsetzung. Ein Claim zur ERPNext-UI-Verwaltung wurde 0-3 widerlegt (zu absolut formuliert: 'vollständig im UI, nicht im Code' — Defaults kommen aus App-Code/Fixtures); die überlebende Zwei-Stufen-Formulierung ist die korrekte. Die TEXMA-Empfehlung (letztes Finding) ist Synthese/Bewertung, keine verifizierte Faktenaussage.

## Offene Fragen

- Wie lösen die kommerziellen Systeme (SAP S/4HANA Berechtigungsobjekte/PFCG, Dynamics 365 BC Permission Sets, Xentral, weclapp, Katana) Granularität und UI-Verwaltung — insbesondere: gibt es dort Muster jenseits der ERPNext/Odoo-Schichtung, die für TEXMA relevant wären (z. B. SAPs feldwert-basierte Berechtigungsobjekte)?
- Wie setzen ERPNext (Workflow-DocType/Workflow Actions) und Odoo (Approvals-Modul, Studio-Approval-Rules) mehrstufige Freigabe-Workflows und Vertretungs-/Delegationsregeln (Abwesenheitsvertretung, temporäre Rechteübertragung) konkret um — der einzige verifizierte Approval-Mechanismus war das Permlevel-Statusfeld-Muster?
- Wie lassen sich Odoos operationsspezifische Record-Rule-Semantik (separate Prädikate für read/write/create/unlink, global-AND vs. gruppen-OR) idiomatisch auf Postgres-RLS-Policies (ADR 0004) abbilden, und wie geht man mit dem Default-allow-vs-default-deny-Konflikt zwischen Record-Regeln und RLS um?
- Wie erzwingen ERPNext/Odoo Feld-Ebene-Rechte performant in Listen-/Aggregations-Queries (ERPNext hatte hier nachweislich Lücken, Issue #16388) — welche Architektur braucht TEXMA, damit eine deklarative Feld-Redaktion auch AutoTable-Listen und Reports abdeckt, nicht nur Detail-Responses?

## Widerlegte Claims (aussortiert)

- {"claim": "ERPNext-Berechtigungen sind rollenbasiert und werden vollständig im UI über den 'Role Permissions Manager' verwaltet: Rollen werden Usern zugewiesen, und pro Rolle und DocType (Belegtyp) werden Regeln für read/write/create/submit usw. gesetzt — nicht im Code definiert.", "vote": "0-3", "source": "https://docs.frappe.io/erpnext/role-based-permissions"}

## Quellenverzeichnis

- {"url": "https://docs.frappe.io/framework/user/en/basics/users-and-permissions", "quality": "primary", "angle": "Open-Source-Referenz: ERPNext/Frappe Permission-Engine", "claimCount": 5}
- {"url": "https://docs.frappe.io/erpnext/role-based-permissions", "quality": "primary", "angle": "Open-Source-Referenz: ERPNext/Frappe Permission-Engine", "claimCount": 5}
- {"url": "https://docs.frappe.io/erpnext/user-permissions", "quality": "primary", "angle": "Open-Source-Referenz: ERPNext/Frappe Permission-Engine", "claimCount": 5}
- {"url": "https://docs.frappe.io/erpnext/changing-the-properties-of-a-field-based-on-role", "quality": "primary", "angle": "Open-Source-Referenz: ERPNext/Frappe Permission-Engine", "claimCount": 5}
- {"url": "https://docs.erpnext.com/docs/user/manual/en/role-and-role-profile", "quality": "unreliable", "angle": "Open-Source-Referenz: ERPNext/Frappe Permission-Engine", "claimCount": 0}
- {"url": "https://docs.frappe.io/erpnext/user/manual/en/users-and-permissions", "quality": "primary", "angle": "Open-Source-Referenz: ERPNext/Frappe Permission-Engine", "claimCount": 5}
- {"url": "https://www.odoo.com/documentation/18.0/developer/reference/backend/security.html", "quality": "unreliable", "angle": "Open-Source-Referenz: Odoo Access Rights & Record Rules", "claimCount": 0}
- {"url": "https://www.odoo.com/documentation/18.0/developer/tutorials/restrict_data_access.html", "quality": "primary", "angle": "Open-Source-Referenz: Odoo Access Rights & Record Rules", "claimCount": 5}
- {"url": "https://medium.com/@niralchaudhary9/odoo-security-complete-guide-to-access-rights-record-rules-field-level-security-e0e3c878f08f", "quality": "unreliable", "angle": "Open-Source-Referenz: Odoo Access Rights & Record Rules", "claimCount": 0}
- {"url": "https://www.odoo.com/documentation/18.0/developer/tutorials/server_framework_101/04_securityintro.html", "quality": "primary", "angle": "Open-Source-Referenz: Odoo Access Rights & Record Rules", "claimCount": 5}
- {"url": "https://sgeede.com/blog/sgeede-knowledge-4/understanding-user-roles-access-rights-and-security-in-odoo-18-103", "quality": "unreliable", "angle": "Open-Source-Referenz: Odoo Access Rights & Record Rules", "claimCount": 0}
- {"url": "https://www.veuzconcepts.com/blog-single/security-group-access-rights-record-rules-odoo-18", "quality": "unreliable", "angle": "Open-Source-Referenz: Odoo Access Rights & Record Rules", "claimCount": 0}
- {"url": "https://www.softwareone.com/en/blog/articles/2025/03/14/sap-roles-and-authorization-in-s4hana", "quality": "unreliable", "angle": "Enterprise-Muster: SAP & Dynamics 365 BC Rollenarchitektur", "claimCount": 0}
- {"url": "https://learn.microsoft.com/en-us/dynamics365/business-central/ui-security-groups", "quality": "primary", "angle": "Enterprise-Muster: SAP & Dynamics 365 BC Rollenarchitektur", "claimCount": 5}
- {"url": "https://archerpoint.com/business-central-permission-sets-and-security-groups-pt-1/", "quality": "unreliable", "angle": "Enterprise-Muster: SAP & Dynamics 365 BC Rollenarchitektur", "claimCount": 0}
- {"url": "https://community.sap.com/t5/technology-blog-posts-by-members/role-design-strategy-for-sap-s-4-hana-public-cloud/ba-p/13795629", "quality": "unreliable", "angle": "Enterprise-Muster: SAP & Dynamics 365 BC Rollenarchitektur", "claimCount": 0}
- {"url": "https://doc.weclapp.com/knowledgebase/wie-funktioniert-die-berechtigungsverwaltung/", "quality": "unreliable", "angle": "Deutsche KMU-Konkurrenz: Xentral, weclapp, Katana", "claimCount": 0}
- {"url": "https://doc.weclapp.com/knowledgebase/wie-konfiguriere-ich-rollen-fuer-die-berechtigungsverwaltung/", "quality": "unreliable", "angle": "Deutsche KMU-Konkurrenz: Xentral, weclapp, Katana", "claimCount": 0}
- {"url": "https://support.katanamrp.com/en/articles/6521954-user-permissions-overview", "quality": "primary", "angle": "Deutsche KMU-Konkurrenz: Xentral, weclapp, Katana", "claimCount": 5}
- {"url": "https://help.xentral.com/hc/en-us/articles/360017521360-User-Permissions-Assignment-Workflow", "quality": "primary", "angle": "Deutsche KMU-Konkurrenz: Xentral, weclapp, Katana", "claimCount": 5}
- {"url": "https://casl.js.org/v6/en/package/casl-prisma/", "quality": "primary", "angle": "Implementierung im TEXMA-Stack: RBAC/ABAC mit tRPC und Postgres RLS", "claimCount": 5}
- {"url": "https://github.com/prisma/prisma-client-extensions/tree/main/row-level-security", "quality": "primary", "angle": "Implementierung im TEXMA-Stack: RBAC/ABAC mit tRPC und Postgres RLS", "claimCount": 5}
- {"url": "https://github.com/stalniy/casl/discussions/905", "quality": "forum", "angle": "Implementierung im TEXMA-Stack: RBAC/ABAC mit tRPC und Postgres RLS", "claimCount": 4}
- {"url": "https://docs.frappe.io/erpnext/workflows", "quality": "primary", "angle": "Approval-Workflows und Delegation/Vertretung nach Rolle", "claimCount": 5}
- {"url": "https://learn.microsoft.com/en-us/dynamics365/business-central/across-how-to-set-up-approval-users", "quality": "primary", "angle": "Approval-Workflows und Delegation/Vertretung nach Rolle", "claimCount": 5}
- {"url": "https://learn.microsoft.com/en-us/dynamics365/business-central/across-how-use-approval-workflows", "quality": "primary", "angle": "Approval-Workflows und Delegation/Vertretung nach Rolle", "claimCount": 5}
- {"url": "https://userapps.support.sap.com/sap/support/knowledge/en/2509563", "quality": "unreliable", "angle": "Approval-Workflows und Delegation/Vertretung nach Rolle", "claimCount": 0}

## Statistik

```json
{
  "angles": 6,
  "sourcesFetched": 27,
  "claimsExtracted": 79,
  "claimsVerified": 25,
  "confirmed": 24,
  "killed": 1,
  "unverified": 0,
  "afterSynthesis": 9,
  "urlDupes": 0,
  "budgetDropped": 9,
  "agentCalls": 110
}
```
