"use server";

import { createAppDocumentService } from "@/lib/db/app-service";
import type {
  CreateDocumentInput,
  DeleteDocumentInput,
  RenderJobRecord,
  RenameDocumentInput,
  SaveDocumentInput,
} from "@/lib/documents/types";
import type { WorkspaceState } from "@/lib/documents/service";
import { revalidatePath } from "next/cache";

export async function selectDocumentAction(documentId: string) {
  return createAppDocumentService().getWorkspace(documentId);
}

export async function saveDocumentAction(input: SaveDocumentInput) {
  const workspace = await createAppDocumentService().saveDocument(input);
  revalidatePath("/");

  return workspace;
}

export async function createDocumentAction(input: CreateDocumentInput) {
  const workspace = await createAppDocumentService().createDocument(input);
  revalidatePath("/");

  return workspace;
}

export async function renameDocumentAction(input: RenameDocumentInput) {
  const workspace = await createAppDocumentService().renameDocument(input);
  revalidatePath("/");

  return workspace;
}

export async function deleteDocumentAction(input: DeleteDocumentInput) {
  const workspace = await createAppDocumentService().deleteDocument(input);
  revalidatePath("/");

  return workspace;
}

export async function renderDocumentAction(input: SaveDocumentInput): Promise<{ workspace: WorkspaceState; jobId: string }> {
  const result = await createAppDocumentService().renderDocument(input);
  revalidatePath("/");

  return result;
}

export async function getRenderJobAction(jobId: string): Promise<RenderJobRecord | null> {
  return createAppDocumentService().getRenderJob(jobId);
}
