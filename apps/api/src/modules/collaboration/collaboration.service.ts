// Generischer Datensatz-Querschnitt (ERP-Grundfunktion): Kommentare, Aktivitäten
// ("was ist als Nächstes") und Anhänge an JEDEM Beleg/Stammsatz — polymorph über
// (entity, entityId). Kein DocType-Framework, nur die ERP-Basics. Schreibzugriffe
// werden auditiert (append-only; Aktivitäten dürfen abgehakt werden).

import { buildEntry, type AuditSink } from "@texma/audit";

export type ActivityKind = "TASK" | "EVENT";

export interface RecordComment {
  id: string;
  entity: string;
  entityId: string;
  author: string;
  text: string;
  createdAt: Date;
}

export interface RecordActivity {
  id: string;
  entity: string;
  entityId: string;
  kind: ActivityKind;
  title: string;
  dueDate: Date | null;
  done: boolean;
  createdBy: string;
  createdAt: Date;
}

export interface RecordAttachment {
  id: string;
  entity: string;
  entityId: string;
  fileName: string;
  mimeType: string | null;
  url: string;
  uploadedBy: string;
  createdAt: Date;
}

export interface CollaborationRepository {
  listComments(entity: string, entityId: string): Promise<RecordComment[]>;
  addComment(input: { entity: string; entityId: string; author: string; text: string }): Promise<RecordComment>;
  listActivities(entity: string, entityId: string): Promise<RecordActivity[]>;
  addActivity(input: {
    entity: string; entityId: string; kind: ActivityKind; title: string; dueDate: Date | null; createdBy: string;
  }): Promise<RecordActivity>;
  setActivityDone(id: string, done: boolean): Promise<RecordActivity | null>;
  listAttachments(entity: string, entityId: string): Promise<RecordAttachment[]>;
  addAttachment(input: {
    entity: string; entityId: string; fileName: string; mimeType: string | null; url: string; uploadedBy: string;
  }): Promise<RecordAttachment>;
}

export class CollaborationError extends Error {}

export class CollaborationService {
  constructor(
    private readonly repo: CollaborationRepository,
    private readonly audit: AuditSink
  ) {}

  listComments(entity: string, entityId: string): Promise<RecordComment[]> {
    return this.repo.listComments(entity, entityId);
  }

  async addComment(entity: string, entityId: string, author: string, text: string): Promise<RecordComment> {
    if (!text.trim()) throw new CollaborationError("Kommentar darf nicht leer sein.");
    const c = await this.repo.addComment({ entity, entityId, author, text: text.trim() });
    await this.audit.append(buildEntry({ entity, entityId, action: "UPDATE", after: { comment: c.id } }));
    return c;
  }

  listActivities(entity: string, entityId: string): Promise<RecordActivity[]> {
    return this.repo.listActivities(entity, entityId);
  }

  async addActivity(
    entity: string, entityId: string, createdBy: string,
    input: { kind: ActivityKind; title: string; dueDate: Date | null }
  ): Promise<RecordActivity> {
    if (!input.title.trim()) throw new CollaborationError("Titel darf nicht leer sein.");
    const a = await this.repo.addActivity({ entity, entityId, createdBy, ...input, title: input.title.trim() });
    await this.audit.append(buildEntry({ entity, entityId, action: "UPDATE", after: { activity: a.id } }));
    return a;
  }

  async setActivityDone(id: string, done: boolean): Promise<RecordActivity> {
    const a = await this.repo.setActivityDone(id, done);
    if (!a) throw new CollaborationError(`Aktivität ${id} nicht gefunden.`);
    await this.audit.append(buildEntry({ entity: a.entity, entityId: a.entityId, action: "UPDATE", after: { activity: id, done } }));
    return a;
  }

  listAttachments(entity: string, entityId: string): Promise<RecordAttachment[]> {
    return this.repo.listAttachments(entity, entityId);
  }

  async addAttachment(
    entity: string, entityId: string, uploadedBy: string,
    input: { fileName: string; mimeType: string | null; url: string }
  ): Promise<RecordAttachment> {
    if (!input.fileName.trim()) throw new CollaborationError("Dateiname fehlt.");
    if (!input.url.trim()) throw new CollaborationError("Datei-URL/Verweis fehlt.");
    const att = await this.repo.addAttachment({ entity, entityId, uploadedBy, ...input });
    await this.audit.append(buildEntry({ entity, entityId, action: "UPDATE", after: { attachment: att.id } }));
    return att;
  }
}
