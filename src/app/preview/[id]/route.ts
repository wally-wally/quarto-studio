import { type NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db/connection";
import { artifactStore } from "@/lib/storage/artifact-store";

const HTML_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy":
    "sandbox allow-scripts; default-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:;",
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sql = getSql();

  const rows = await sql<{ storage_key: string }[]>`
    SELECT storage_key FROM artifacts WHERE id = ${id} LIMIT 1
  `;

  if (rows.length === 0) {
    return NextResponse.json({ error: "Artifact not found" }, { status: 404 });
  }

  const html = await artifactStore.getArtifact(rows[0].storage_key);

  if (html === null) {
    return NextResponse.json({ error: "Artifact not found" }, { status: 404 });
  }

  return new NextResponse(html, {
    status: 200,
    headers: HTML_HEADERS,
  });
}
