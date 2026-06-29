import { getCurrentUser } from "@/lib/auth/session";

export const maxDuration = 30;

// AI Hub(OpenAI 호환 게이트웨이)의 허용 모델 목록. 브라우저에서 직접 부르면 CORS 위험이
// 있어 서버에서 프록시한다. 키는 chat 라우트와 동일하게 x-provider-key 헤더로 받는다.
const AIHUB_MODELS_URL = "https://ai-hub-gabia.gabia.com/v1/models";

// 응답 스키마는 OpenAI /v1/models 형태: data[].id(모델 식별자) + data[].display_name(표시용).
// 일부 문서가 model_name으로 안내하므로 양쪽을 모두 fallback 처리한다.
type AihubModel = { id?: string; model_name?: string; display_name?: string };

export async function GET(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const apiKey = req.headers.get("x-provider-key");
  if (!apiKey) {
    return Response.json({ error: "API 키가 필요합니다." }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(AIHUB_MODELS_URL, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: req.signal,
    });
  } catch (error) {
    console.error("[ai/models] fetch failed:", error);
    return Response.json({ error: "AI Hub에 연결하지 못했습니다." }, { status: 502 });
  }

  if (!upstream.ok) {
    const isAuth = upstream.status === 401 || upstream.status === 403;
    return Response.json(
      { error: isAuth ? "API 키가 올바르지 않습니다." : "모델 목록을 불러오지 못했습니다." },
      { status: isAuth ? 401 : 502 },
    );
  }

  let body: { data?: AihubModel[] };
  try {
    body = await upstream.json();
  } catch {
    return Response.json({ error: "모델 목록 응답을 해석하지 못했습니다." }, { status: 502 });
  }

  const models = (Array.isArray(body.data) ? body.data : [])
    .map((m) => {
      const value = String(m.id ?? m.model_name ?? "");
      return { value, label: String(m.display_name ?? m.model_name ?? value) };
    })
    .filter((m) => m.value);

  return Response.json({ models });
}
