// Prisma-Implementierung des Datensatz-Querschnitts (Kommentare/Aktivitäten/Anhänge).

import { prisma } from "@texma/db";
import type {
  ActivityKind,
  CollaborationRepository,
  RecordActivity,
  RecordAttachment,
  RecordComment,
} from "../modules/collaboration/collaboration.service.js";

export class PrismaCollaborationRepository implements CollaborationRepository {
  async listComments(entity: string, entityId: string): Promise<RecordComment[]> {
    return prisma.recordComment.findMany({
      where: { entity, entityId },
      orderBy: { createdAt: "asc" },
    });
  }
  async addComment(i: { entity: string; entityId: string; author: string; text: string }): Promise<RecordComment> {
    return prisma.recordComment.create({ data: i });
  }

  async listActivities(entity: string, entityId: string): Promise<RecordActivity[]> {
    const rows = await prisma.recordActivity.findMany({
      where: { entity, entityId },
      orderBy: [{ done: "asc" }, { dueDate: "asc" }],
    });
    return rows.map((r) => ({ ...r, kind: r.kind as ActivityKind }));
  }
  async addActivity(i: {
    entity: string; entityId: string; kind: ActivityKind; title: string; dueDate: Date | null; createdBy: string;
  }): Promise<RecordActivity> {
    const r = await prisma.recordActivity.create({ data: i });
    return { ...r, kind: r.kind as ActivityKind };
  }
  async setActivityDone(id: string, done: boolean): Promise<RecordActivity | null> {
    try {
      const r = await prisma.recordActivity.update({ where: { id }, data: { done } });
      return { ...r, kind: r.kind as ActivityKind };
    } catch {
      return null;
    }
  }

  async listAttachments(entity: string, entityId: string): Promise<RecordAttachment[]> {
    return prisma.recordAttachment.findMany({
      where: { entity, entityId },
      orderBy: { createdAt: "asc" },
    });
  }
  async addAttachment(i: {
    entity: string; entityId: string; fileName: string; mimeType: string | null; url: string; uploadedBy: string;
  }): Promise<RecordAttachment> {
    return prisma.recordAttachment.create({ data: i });
  }
}
