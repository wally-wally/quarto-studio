import { type NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db/connection";
import { artifactStore } from "@/lib/storage/artifact-store";

const HTML_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  // Quarto의 embed-resources는 테마·하이라이트 CSS를 <link href="data:text/css,…">로 임베드한다.
  // style-src/script-src에 data: 를 허용하지 않으면 그 CSS/JS가 CSP에 차단되어 코드 하이라이팅·
  // 복사 버튼·테마가 적용되지 않아 미리보기가 밋밋해진다. 미리보기는 sandbox(allow-scripts,
  // same-origin 없음)로 격리되고 connect-src는 default-src('self'=opaque)로 묶여 외부 전송이
  // 불가하므로 data: 리소스 허용은 안전하다.
  "Content-Security-Policy":
    "sandbox allow-scripts; default-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' data:; script-src 'self' 'unsafe-inline' data:; img-src 'self' data:; font-src 'self' data:;",
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
