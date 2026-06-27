import { createTheme } from "@uiw/codemirror-themes";
import { tags as t } from "@lezer/highlight";

// Night Owl (Sarah Drasner) 팔레트를 CodeMirror 6용으로 정의.
// @uiw 테마 생태계엔 Night Owl 프리셋이 없어, createTheme 로 정통 색상을 직접 구성한다.
const colors = {
  background: "#011627",
  foreground: "#d6deeb",
  caret: "#80a4c2",
  selection: "#1d3b53",
  selectionMatch: "#5f7e97",
  lineHighlight: "#0b2942",
  gutterBg: "#011627",
  gutterFg: "#4b6479",
  gutterActiveFg: "#c5e4fd",

  comment: "#637777",
  keyword: "#c792ea",
  operator: "#7fdbca",
  string: "#ecc48d",
  number: "#f78c6c",
  boolean: "#ff5874",
  function: "#82aaff",
  variable: "#d6deeb",
  property: "#80cbc4",
  className: "#ffcb8b",
  type: "#addb67",
  tag: "#caece6",
  attribute: "#addb67",
  heading: "#82aaff",
  link: "#ff869a",
  punctuation: "#7fdbca",
  invalid: "#ff5874"
};

export const nightOwl = createTheme({
  theme: "dark",
  settings: {
    background: colors.background,
    foreground: colors.foreground,
    caret: colors.caret,
    selection: colors.selection,
    selectionMatch: colors.selectionMatch,
    lineHighlight: colors.lineHighlight,
    gutterBackground: colors.gutterBg,
    gutterForeground: colors.gutterFg,
    gutterActiveForeground: colors.gutterActiveFg,
    gutterBorder: "transparent",
    fontFamily: "var(--font-mono)"
  },
  styles: [
    { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: colors.comment, fontStyle: "italic" },
    {
      tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.definitionKeyword, t.operatorKeyword, t.modifier, t.self],
      color: colors.keyword
    },
    {
      tag: [t.operator, t.logicOperator, t.arithmeticOperator, t.compareOperator, t.bitwiseOperator, t.derefOperator],
      color: colors.operator
    },
    { tag: [t.string, t.special(t.string), t.regexp, t.escape], color: colors.string },
    { tag: [t.number, t.integer, t.float], color: colors.number },
    { tag: [t.bool, t.atom, t.null], color: colors.boolean },
    { tag: [t.function(t.variableName), t.function(t.propertyName), t.labelName], color: colors.function },
    { tag: [t.variableName, t.local(t.variableName)], color: colors.variable },
    { tag: [t.propertyName], color: colors.property },
    { tag: [t.className, t.namespace], color: colors.className },
    { tag: [t.typeName, t.constant(t.name), t.standard(t.name)], color: colors.type },
    { tag: [t.tagName, t.angleBracket], color: colors.tag },
    { tag: [t.attributeName, t.attributeValue], color: colors.attribute },
    { tag: [t.heading, t.heading1, t.heading2, t.heading3, t.heading4, t.heading5, t.heading6], color: colors.heading, fontWeight: "bold" },
    { tag: [t.link, t.url], color: colors.link, textDecoration: "underline" },
    { tag: t.strong, color: colors.type, fontWeight: "bold" },
    { tag: t.emphasis, color: colors.keyword, fontStyle: "italic" },
    { tag: t.strikethrough, textDecoration: "line-through" },
    { tag: [t.quote], color: colors.comment, fontStyle: "italic" },
    { tag: [t.list], color: colors.operator },
    { tag: [t.monospace], color: colors.string },
    { tag: [t.processingInstruction, t.meta], color: colors.punctuation },
    { tag: [t.punctuation, t.separator, t.bracket, t.brace, t.paren, t.squareBracket], color: colors.punctuation },
    { tag: t.invalid, color: colors.invalid }
  ]
});
