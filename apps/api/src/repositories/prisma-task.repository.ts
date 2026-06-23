// Prisma-Task-Repo (Produktionspfad).
import { prisma } from "@texma/db";
import type { CreateTaskInput, TaskRepository, TaskRow } from "../modules/task/task.service.js";

function map(t: {
  id: string; title: string; description: string | null; entity: string | null; entityId: string | null;
  navKey: string | null; assigneeEmail: string; createdBy: string | null; status: string; dueDate: Date | null;
  createdAt: Date; completedAt: Date | null;
}): TaskRow {
  return { ...t, status: t.status === "ERLEDIGT" ? "ERLEDIGT" : "OFFEN" };
}

export class PrismaTaskRepository implements TaskRepository {
  async create(input: CreateTaskInput): Promise<{ id: string }> {
    return prisma.task.create({
      data: {
        title: input.title, description: input.description ?? null,
        entity: input.entity ?? null, entityId: input.entityId ?? null, navKey: input.navKey ?? null,
        assigneeEmail: input.assigneeEmail, createdBy: input.createdBy ?? null, dueDate: input.dueDate ?? null,
      },
      select: { id: true },
    });
  }
  async listForUser(email: string, includeDone: boolean): Promise<TaskRow[]> {
    const rows = await prisma.task.findMany({
      where: { assigneeEmail: email, ...(includeDone ? {} : { status: "OFFEN" }) },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(map);
  }
  async listForEntity(entity: string, entityId: string): Promise<TaskRow[]> {
    return (await prisma.task.findMany({ where: { entity, entityId }, orderBy: { createdAt: "desc" } })).map(map);
  }
  async openCount(email: string): Promise<number> {
    return prisma.task.count({ where: { assigneeEmail: email, status: "OFFEN" } });
  }
  async setStatus(id: string, status: "OFFEN" | "ERLEDIGT", completedAt: Date | null): Promise<void> {
    await prisma.task.update({ where: { id }, data: { status, completedAt } });
  }
  async reassign(id: string, email: string): Promise<void> {
    await prisma.task.update({ where: { id }, data: { assigneeEmail: email } });
  }
}
