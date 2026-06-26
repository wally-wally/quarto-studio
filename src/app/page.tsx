import { QuartoWorkspace } from "@/components/workspace/quarto-workspace";
import { createAppDocumentService } from "@/lib/db/app-service";
import { getCurrentUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import {
  createDocumentAction,
  deleteDocumentAction,
  getRenderJobAction,
  renderDocumentAction,
  renameDocumentAction,
  saveDocumentAction,
  selectDocumentAction
} from "./actions";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const initialWorkspace = await createAppDocumentService().getInitialWorkspace();

  return (
    <QuartoWorkspace
      initialWorkspace={initialWorkspace}
      user={user}
      saveDocument={saveDocumentAction}
      renderDocument={renderDocumentAction}
      selectDocument={selectDocumentAction}
      createDocument={createDocumentAction}
      renameDocument={renameDocumentAction}
      deleteDocument={deleteDocumentAction}
      getRenderJob={getRenderJobAction}
    />
  );
}
