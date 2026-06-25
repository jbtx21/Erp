// In-Memory-Task-Repo für Tests.
import type { CreateTaskInput, TaskRepository, TaskRow, UpdateTaskInput } from "../modules/task/task.service.js";

export class InMemoryTaskRepository implements TaskRepository {
  private seq = 0;
  private readonly tasks: TaskRow[] = [];

  async create(input: CreateTaskInput): Promise<{ id: string }> {
    const id = `task_${String(++this.seq)}`;
    this.tasks.push({
      id, title: input.title, description: input.description ?? null,
      entity: input.entity ?? null, entityId: input.entityId ?? null, navKey: input.navKey ?? null,
      assigneeEmail: input.assigneeEmail, createdBy: input.createdBy ?? null,
      status: "OFFEN", dueDate: input.dueDate ?? null, createdAt: new Date(), completedAt: null,
    });
    return { id };
  }
  async listForUser(email: string, includeDone: boolean): Promise<TaskRow[]> {
    return this.tasks.filter((t) => t.assigneeEmail === email && (includeDone || t.status === "OFFEN"))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  async listForEntity(entity: string, entityId: string): Promise<TaskRow[]> {
    return this.tasks.filter((t) => t.entity === entity && t.entityId === entityId);
  }
  async openCount(email: string): Promise<number> {
    return this.tasks.filter((t) => t.assigneeEmail === email && t.status === "OFFEN").length;
  }
  async update(id: string, patch: UpdateTaskInput): Promise<void> {
    const t = this.tasks.find((x) => x.id === id);
    if (!t) return;
    if (patch.title !== undefined) t.title = patch.title;
    if (patch.description !== undefined) t.description = patch.description;
    if (patch.dueDate !== undefined) t.dueDate = patch.dueDate;
    if (patch.navKey !== undefined) t.navKey = patch.navKey;
  }
  async setStatus(id: string, status: "OFFEN" | "ERLEDIGT", completedAt: Date | null): Promise<void> {
    const t = this.tasks.find((x) => x.id === id);
    if (t) { t.status = status; t.completedAt = completedAt; }
  }
  async reassign(id: string, email: string): Promise<void> {
    const t = this.tasks.find((x) => x.id === id);
    if (t) t.assigneeEmail = email;
  }
}
