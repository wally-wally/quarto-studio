"use server";

import { createAppDocumentService } from "@/lib/db/app-service";
import type { SaveDocumentInput } from "@/lib/documents/types";
import { revalidatePath } from "next/cache";

export async function selectDocumentAction(documentId: string) {
  return createAppDocumentService().getWorkspace(documentId);
}

export async function saveDocumentAction(input: SaveDocumentInput) {
  const workspace = createAppDocumentService().saveDocument(input);
  revalidatePath("/");

  return workspace;
}

export async function renderDocumentAction(input: SaveDocumentInput) {
  const workspace = await createAppDocumentService().renderDocument(input);
  revalidatePath("/");

  return workspace;
}
