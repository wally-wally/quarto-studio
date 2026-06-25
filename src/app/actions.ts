"use server";

import { createAppDocumentService } from "@/lib/db/app-service";
import type {
  CreateDocumentInput,
  DeleteDocumentInput,
  RenameDocumentInput,
  SaveDocumentInput,
} from "@/lib/documents/types";
import { revalidatePath } from "next/cache";

export async function selectDocumentAction(documentId: string) {
  return createAppDocumentService().getWorkspace(documentId);
}

export async function saveDocumentAction(input: SaveDocumentInput) {
  const workspace = createAppDocumentService().saveDocument(input);
  revalidatePath("/");

  return workspace;
}

export async function createDocumentAction(input: CreateDocumentInput) {
  const workspace = createAppDocumentService().createDocument(input);
  revalidatePath("/");

  return workspace;
}

export async function renameDocumentAction(input: RenameDocumentInput) {
  const workspace = createAppDocumentService().renameDocument(input);
  revalidatePath("/");

  return workspace;
}

export async function deleteDocumentAction(input: DeleteDocumentInput) {
  const workspace = createAppDocumentService().deleteDocument(input);
  revalidatePath("/");

  return workspace;
}

export async function renderDocumentAction(input: SaveDocumentInput) {
  const workspace = await createAppDocumentService().renderDocument(input);
  revalidatePath("/");

  return workspace;
}
