"use server";

import { createAppDocumentService } from "@/lib/db/app-service";
import { getCurrentUser } from "@/lib/auth/session";
import type {
  CreateDocumentInput,
  DeleteDocumentInput,
  RenderJobRecord,
  RenameDocumentInput,
  SaveDocumentInput,
} from "@/lib/documents/types";
import type { WorkspaceState } from "@/lib/documents/service";
import { revalidatePath } from "next/cache";

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("인증이 필요합니다");
  return user;
}

export async function selectDocumentAction(documentId: string) {
  const user = await requireUser();
  return createAppDocumentService().getWorkspace(user.id, documentId);
}

export async function saveDocumentAction(input: SaveDocumentInput) {
  const user = await requireUser();
  const workspace = await createAppDocumentService().saveDocument(user.id, input);
  revalidatePath("/");

  return workspace;
}

export async function createDocumentAction(input: CreateDocumentInput) {
  const user = await requireUser();
  const workspace = await createAppDocumentService().createDocument(user.id, input);
  revalidatePath("/");

  return workspace;
}

export async function renameDocumentAction(input: RenameDocumentInput) {
  const user = await requireUser();
  const workspace = await createAppDocumentService().renameDocument(user.id, input);
  revalidatePath("/");

  return workspace;
}

export async function deleteDocumentAction(input: DeleteDocumentInput) {
  const user = await requireUser();
  const workspace = await createAppDocumentService().deleteDocument(user.id, input);
  revalidatePath("/");

  return workspace;
}

export async function renderDocumentAction(input: SaveDocumentInput): Promise<{ workspace: WorkspaceState; jobId: string }> {
  const user = await requireUser();
  const result = await createAppDocumentService().renderDocument(user.id, input);
  revalidatePath("/");

  return result;
}

export async function getRenderJobAction(jobId: string): Promise<RenderJobRecord | null> {
  await requireUser();
  return createAppDocumentService().getRenderJob(jobId);
}
