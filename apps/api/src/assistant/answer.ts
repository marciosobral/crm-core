import type { AssistantLink } from "@crm/contract"
import { Schema } from "effect"
import { foreignWords, portugueseWords } from "./language-words.ts"
import { type LinkCollector, resolveLinks } from "./links.ts"

export const AnswerKind = Schema.Literals([
  "DATA_ANSWER",
  "HOW_TO",
  "NOT_SUPPORTED",
  "CONVERSATION",
  "OUT_OF_SCOPE",
  "SENSITIVE",
  "UNCLEAR",
])
export type AnswerKind = typeof AnswerKind.Type

export const ChatAnswer = Schema.Struct({
  kind: AnswerKind,
  text: Schema.String,
  linkIds: Schema.Array(Schema.String),
})
export type ChatAnswer = typeof ChatAnswer.Type

export const fixedReplies = {
  OUT_OF_SCOPE: "Só posso ajudar com seus leads, negócios e com o uso do CRM.",
  SENSITIVE:
    "Não posso ajudar com isso por aqui; sou o assistente do CRM. Em caso de emergência, ligue 192 (SAMU) ou 188 (CVV).",
  UNCLEAR: "Não entendi. Pergunte sobre seus leads, negócios ou sobre como usar o CRM.",
} as const
export type RefusalKind = keyof typeof fixedReplies

export const isRefusal = (rejected: string): rejected is RefusalKind =>
  Object.hasOwn(fixedReplies, rejected)

export const guardFallbackReply =
  "Não consegui responder isso por aqui. Pergunte sobre seus leads e negócios."

export const unfinishedChatReply = "Não consegui concluir essa resposta. Tente reformular."

export const maxReplyLength = 800

export type GuardReason =
  | "EMPTY"
  | "TOO_LONG"
  | "LOOKS_LIKE_CODE"
  | "UNKNOWN_LINK"
  | "NOT_PORTUGUESE"
  | "NUMBERS_WITHOUT_DATA"

// A deliberately coarse check: foreign words win only when they clearly outnumber Portuguese ones,
// so short or number-heavy answers ("R$ 145.000,00") are never rejected for lack of words.
const looksForeign = (text: string) => {
  const words =
    text
      .toLowerCase()
      .replaceAll("\u2019", "'")
      .match(/[\p{L}']+/gu) ?? []
  const foreign = words.filter((word) => foreignWords.has(word)).length
  const portuguese = words.filter((word) => portugueseWords.has(word)).length
  return foreign >= 2 && foreign > portuguese
}

const looksLikeCode = (text: string) => {
  const trimmed = text.trim()
  return (
    trimmed.startsWith("{") ||
    trimmed.startsWith("[") ||
    trimmed.includes("```") ||
    trimmed.toLowerCase().includes("<script")
  )
}

export const guardReason = (
  answer: Pick<ChatAnswer, "text" | "linkIds">,
  knownLinkIds: ReadonlyArray<string>,
): GuardReason | null => {
  if (answer.text.trim() === "") return "EMPTY"
  if (answer.text.length > maxReplyLength) return "TOO_LONG"
  if (looksLikeCode(answer.text)) return "LOOKS_LIKE_CODE"
  if (answer.linkIds.some((id) => !knownLinkIds.includes(id))) return "UNKNOWN_LINK"
  if (looksForeign(answer.text)) return "NOT_PORTUGUESE"
  return null
}

// The model sometimes punctuates with dashes however the prompt asks otherwise; a comma reads the
// same in Portuguese.
export const withoutDashPunctuation = (text: string) =>
  text
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/,(\s*,)+/g, ",")
    .replace(/[ \t]{2,}/g, " ")

export interface FinalReply {
  readonly text: string
  readonly links: ReadonlyArray<AssistantLink>
  readonly rejected: GuardReason | RefusalKind | "NO_ANSWER" | null
}

// Turns the model's structured answer into what the user sees. The text of out-of-scope, sensitive
// and unclear answers is discarded without being read, and anything the guard rejects is replaced
// by a fixed sentence, so unvetted model text never reaches the user. A reply is worth keeping in
// the history only when `rejected` is null.
export const finalizeAnswer = (
  answer: ChatAnswer | null,
  collector: LinkCollector,
  hasRunDataTool: boolean,
): FinalReply => {
  if (answer === null) return { text: unfinishedChatReply, links: [], rejected: "NO_ANSWER" }
  if (answer.kind === "OUT_OF_SCOPE" || answer.kind === "SENSITIVE" || answer.kind === "UNCLEAR")
    return { text: fixedReplies[answer.kind], links: [], rejected: answer.kind }
  const text = withoutDashPunctuation(answer.text)
  const reason = guardReason(
    { text, linkIds: answer.linkIds },
    collector.collected().map(({ id }) => id),
  )
  if (reason !== null) return { text: guardFallbackReply, links: [], rejected: reason }
  // Cheap anti-invention rule: figures in a data answer must come from a tool run in this message.
  if (answer.kind === "DATA_ANSWER" && !hasRunDataTool && /\d|R\$/.test(text))
    return { text: guardFallbackReply, links: [], rejected: "NUMBERS_WITHOUT_DATA" }
  // A guide reply says how to do something or that it cannot be done: a data button would answer
  // a question the user did not ask.
  const isGuideKind = answer.kind === "HOW_TO" || answer.kind === "NOT_SUPPORTED"
  return {
    text: text.trim(),
    links: resolveLinks(
      answer.linkIds,
      collector,
      (link) => !isGuideKind || link.kind === "OPEN_SCREEN",
    ),
    rejected: null,
  }
}
