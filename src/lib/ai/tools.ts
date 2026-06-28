import { tool, jsonSchema } from "ai";

export const EDIT_TOOL = "edit_document";
export const WRITE_TOOL = "write_document";

export type EditDocumentInput = { edits: { find: string; replace: string }[] };
export type WriteDocumentInput = { content: string };

// execute를 정의하지 않는다 → AI SDK가 서버에서 실행하지 않고 tool-call 파트만 방출한다.
// 단일 스텝이므로 도구 호출 후 스트림이 종료되고, 클라이언트가 에디터에 적용한다.
export const chatTools = {
  [EDIT_TOOL]: tool({
    description:
      "현재 문서에서 정확히 일치하는 문자열을 찾아 치환한다(부분 편집). 기존 문서의 일부만 바꿀 때 사용. 여러 편집을 한 번에 넘길 수 있다. find는 현재 문서에 그대로 존재하는, 충분히 구체적인 문자열이어야 한다.",
    inputSchema: jsonSchema<EditDocumentInput>({
      type: "object",
      additionalProperties: false,
      properties: {
        edits: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              find: { type: "string", description: "현재 문서에 그대로 존재하는 정확한 문자열" },
              replace: { type: "string", description: "find를 대체할 문자열(삭제는 빈 문자열)" },
            },
            required: ["find", "replace"],
          },
        },
      },
      required: ["edits"],
    }),
  }),
  [WRITE_TOOL]: tool({
    description:
      "문서 전체를 작성하거나 교체한다. 문서가 비었거나 처음 만들 때, 또는 전면 재작성이 필요할 때 사용.",
    inputSchema: jsonSchema<WriteDocumentInput>({
      type: "object",
      additionalProperties: false,
      properties: {
        content: { type: "string", description: "완전한 .qmd 본문(YAML 프런트매터로 시작)" },
      },
      required: ["content"],
    }),
  }),
};
