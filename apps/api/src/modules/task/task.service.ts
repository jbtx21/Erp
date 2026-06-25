// Aufgaben/Zuweisung (ERPNext „Assigned To/ToDo"): Belege/Vorgänge einer Person zuweisen,
// persönliche Arbeitsliste, Erledigen/Neuzuweisen. Optional an einen Beleg gekoppelt.

import { buildEntry, type AuditSink } from "@texma/audit";

export class TaskError extends Error {}

export interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  entity: string | null;
  entityId: string | null;
  navKey: string | null;
  assigneeEmail: string;
  createdBy: string | null;
  status: "OFFEN" | "ERLEDIGT";
  dueDate: Date | null;
  createdAt: Date;
  completedAt: Date | null;
}

export interface CreateTaskInput {
  title: string;
  description?: string | null;
  assigneeEmail: string;
  entity?: string | null;
  entityId?: string | null;
  navKey?: string | null;
  dueDate?: Date | null;
  createdBy?: string | null;
}

/** Bearbeitbare Felder einer Aufgabe (Status/Zuweisung laufen über complete/reopen/reassign). */
export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  dueDate?: Date | null;
  navKey?: string | null;
}

export interface TaskRepository {
  create(input: CreateTaskInput): Promise<{ id: string }>;
  listForUser(email: string, includeDone: boolean): Promise<TaskRow[]>;
  listForEntity(entity: string, entityId: string): Promise<TaskRow[]>;
  openCount(email: string): Promise<number>;
  update(id: string, patch: UpdateTaskInput): Promise<void>;
  setStatus(id: string, status: "OFFEN" | "ERLEDIGT", completedAt: Date | null): Promise<void>;
  reassign(id: string, email: string): Promise<void>;
}

export class TaskService {
  constructor(private readonly repo: TaskRepository, private readonly audit: AuditSink, private readonly now: () => Date = () => new Date()) {}

  async create(input: CreateTaskInput): Promise<{ id: string }> {
    if (!input.title.trim()) throw new TaskError("Titel ist Pflicht.");
    if (!input.assigneeEmail.trim()) throw new TaskError("Empfänger ist Pflicht.");
    const res = await this.repo.create({ ...input, title: input.title.trim() });
    await this.audit.append(buildEntry({ userId: input.createdBy ?? undefined, entity: "Task", entityId: res.id, action: "CREATE", after: { title: input.title.trim(), assignee: input.assigneeEmail, link: input.entity ? `${input.entity}/${input.entityId}` : null } }));
    return res;
  }

  listForUser(email: string, includeDone = false): Promise<TaskRow[]> { return this.repo.listForUser(email, includeDone); }
  listForEntity(entity: string, entityId: string): Promise<TaskRow[]> { return this.repo.listForEntity(entity, entityId); }
  openCount(email: string): Promise<number> { return this.repo.openCount(email); }

  async complete(id: string, userId?: string): Promise<void> {
    await this.repo.setStatus(id, "ERLEDIGT", this.now());
    await this.audit.append(buildEntry({ userId, entity: "Task", entityId: id, action: "UPDATE", after: { status: "ERLEDIGT" } }));
  }

  async reopen(id: string, userId?: string): Promise<void> {
    await this.repo.setStatus(id, "OFFEN", null);
    await this.audit.append(buildEntry({ userId, entity: "Task", entityId: id, action: "UPDATE", after: { status: "OFFEN" } }));
  }

  /** Bearbeitet Titel/Beschreibung/Fälligkeit einer Aufgabe (GoBD-auditiert). */
  async update(id: string, patch: UpdateTaskInput, userId?: string): Promise<void> {
    if (patch.title !== undefined && !patch.title.trim()) throw new TaskError("Titel ist Pflicht.");
    const clean: UpdateTaskInput = { ...patch };
    if (clean.title !== undefined) clean.title = clean.title.trim();
    await this.repo.update(id, clean);
    await this.audit.append(buildEntry({ userId, entity: "Task", entityId: id, action: "UPDATE", after: { ...clean } }));
  }

  async reassign(id: string, email: string, userId?: string): Promise<void> {
    if (!email.trim()) throw new TaskError("Empfänger ist Pflicht.");
    await this.repo.reassign(id, email.trim());
    await this.audit.append(buildEntry({ userId, entity: "Task", entityId: id, action: "UPDATE", after: { assignee: email.trim() } }));
  }
}
