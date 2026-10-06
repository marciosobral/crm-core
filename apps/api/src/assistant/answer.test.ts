import { expect, it } from "vitest"
import {
  type ChatAnswer,
  finalizeAnswer,
  fixedReplies,
  guardFallbackReply,
  guardReason,
  maxReplyLength,
  unfinishedChatReply,
  withoutDashPunctuation,
} from "./answer.ts"
import { makeLinkCollector } from "./links.ts"

const answer = (text: string, linkIds: ReadonlyArray<string> = []) => ({ text, linkIds })

it("accepts normal Portuguese replies, with numbers and lists", () => {
  for (const text of [
    "Você tem 3 negócios em negociação, no valor de R$ 145.000,00.",
    "Você é Ana Souza, Vendedor.",
    "- Abra Negócios\n- Clique em Novo negócio",
    "R$ 145.000,00",
    "Nenhum negócio encontrado.",
    "O CRM não tem essa funcionalidade.",
  ])
    expect(guardReason(answer(text), [])).toBeNull()
})

it("rejects text that looks like JSON or code", () => {
  for (const text of [
    '{"identity":"I don\'t know who you are."}',
    '[{"a":1}]',
    "Veja:\n```js\nconsole.log(1)\n```",
    "Olá <script>alert(1)</script>",
  ])
    expect(guardReason(answer(text), [])).toBe("LOOKS_LIKE_CODE")
})

it("rejects English replies but not Portuguese ones with a few English words", () => {
  expect(guardReason(answer("I don't know who you are, and this is not a CRM question."), [])).toBe(
    "NOT_PORTUGUESE",
  )
  expect(
    guardReason(answer("Você tem 2 deals abertos no pipeline, o e-mail é novo."), []),
  ).toBeNull()
})

it("rejects Spanish and French replies and English ones with typographic apostrophes", () => {
  for (const text of [
    "Usted tiene 3 negocios abiertos en el pipeline y el valor es alto.",
    "Vous avez 3 affaires ouvertes dans le pipeline et la valeur est élevée.",
    "I don\u2019t know who you are, and this is not a CRM question.",
  ])
    expect(guardReason(answer(text), [])).toBe("NOT_PORTUGUESE")
})

it("accepts Portuguese replies with names, numbers and a few foreign words", () => {
  for (const text of [
    "Ana Souza tem 12 leads e Bruno Lima tem 8 leads.",
    "- Maria José: R$ 55.000,00\n- João Pedro: R$ 0,00",
    "O Studio Gama está parado há 20 dias, no valor de R$ 20.000,00.",
    "Bruno está à frente; Ana está logo atrás.",
  ])
    expect(guardReason(answer(text), [])).toBeNull()
})

it("rejects empty and oversized replies", () => {
  expect(guardReason(answer("   "), [])).toBe("EMPTY")
  expect(guardReason(answer("a".repeat(maxReplyLength + 1)), [])).toBe("TOO_LONG")
  expect(guardReason(answer("a".repeat(maxReplyLength)), [])).toBeNull()
})

it("rejects references to link ids that do not exist", () => {
  expect(guardReason(answer("Veja os negócios.", ["L1"]), ["L1"])).toBeNull()
  expect(guardReason(answer("Veja os negócios.", ["L7"]), ["L1"])).toBe("UNKNOWN_LINK")
})

const reply = (kind: ChatAnswer["kind"], text: string, linkIds: ReadonlyArray<string> = []) => ({
  kind,
  text,
  linkIds,
})

it("discards the model text of out-of-scope, sensitive and unclear answers", () => {
  const collector = makeLinkCollector()
  collector.add({ kind: "VIEW_LEADS", label: "Ver leads", filters: {} })
  for (const kind of ["OUT_OF_SCOPE", "SENSITIVE", "UNCLEAR"] as const)
    expect(
      finalizeAnswer(reply(kind, "Claro! Aqui vai uma piada.", ["L1"]), collector, false),
    ).toEqual({
      text: fixedReplies[kind],
      links: [],
      rejected: kind,
    })
  expect(fixedReplies.SENSITIVE).toContain("192 (SAMU)")
  expect(fixedReplies.SENSITIVE).toContain("188 (CVV)")
})

it("answers a conversation question from the model text under the normal guard", () => {
  const collector = makeLinkCollector()
  expect(
    finalizeAnswer(reply("CONVERSATION", "Você perguntou quantos leads tem."), collector, false),
  ).toEqual({ text: "Você perguntou quantos leads tem.", links: [], rejected: null })
  expect(finalizeAnswer(reply("CONVERSATION", '{"a":1}'), collector, false).rejected).toBe(
    "LOOKS_LIKE_CODE",
  )
})

it("replaces a rejected reply with the fixed fallback and no links", () => {
  const collector = makeLinkCollector()
  collector.add({ kind: "VIEW_LEADS", label: "Ver leads", filters: {} })
  expect(finalizeAnswer(reply("DATA_ANSWER", '{"x":1}', ["L1"]), collector, true)).toEqual({
    text: guardFallbackReply,
    links: [],
    rejected: "LOOKS_LIKE_CODE",
  })
})

it("shows a vetted reply with its named links, and handles a missing answer", () => {
  const collector = makeLinkCollector()
  const lead = { kind: "VIEW_LEADS", label: "Ver 2 leads", filters: {} } as const
  collector.add(lead)
  expect(
    finalizeAnswer(reply("DATA_ANSWER", " Você tem 2 leads. ", ["L1"]), collector, true),
  ).toEqual({
    text: "Você tem 2 leads.",
    links: [lead],
    rejected: null,
  })
  expect(finalizeAnswer(null, collector, false)).toEqual({
    text: unfinishedChatReply,
    links: [],
    rejected: "NO_ANSWER",
  })
})

it("keeps only screen links on NOT_SUPPORTED and HOW_TO replies", () => {
  const collector = makeLinkCollector()
  const screen = { kind: "OPEN_SCREEN", label: "Ir para Leads", screen: "LEADS" } as const
  collector.add({ kind: "VIEW_LEADS", label: "Ver leads", filters: {} })
  collector.add({ kind: "VIEW_DEALS", label: "Ver negócios", filters: {} })
  collector.add(screen)
  for (const kind of ["NOT_SUPPORTED", "HOW_TO"] as const) {
    expect(
      finalizeAnswer(reply(kind, "Veja abaixo.", ["L1", "L2", "L3"]), collector, true).links,
    ).toEqual([screen])
    expect(finalizeAnswer(reply(kind, "Veja abaixo."), collector, true).links).toEqual([screen])
  }
  expect(
    finalizeAnswer(reply("DATA_ANSWER", "Você tem 2 leads.", ["L1"]), collector, true).links,
  ).toHaveLength(1)
})

it("replaces a data answer with figures when no data tool ran in this message", () => {
  const collector = makeLinkCollector()
  expect(finalizeAnswer(reply("DATA_ANSWER", "Você tem 3 leads."), collector, false)).toEqual({
    text: guardFallbackReply,
    links: [],
    rejected: "NUMBERS_WITHOUT_DATA",
  })
  expect(finalizeAnswer(reply("DATA_ANSWER", "Vendeu R$ 5,00."), collector, false).rejected).toBe(
    "NUMBERS_WITHOUT_DATA",
  )
  expect(
    finalizeAnswer(reply("DATA_ANSWER", "Você tem 3 leads."), collector, true).rejected,
  ).toBeNull()
  expect(
    finalizeAnswer(reply("DATA_ANSWER", "Você é Ana Souza, Vendedor."), collector, false).rejected,
  ).toBeNull()
  expect(
    finalizeAnswer(reply("HOW_TO", "Passo 1: abra Leads."), collector, false).rejected,
  ).toBeNull()
})

it("replaces dashes used as punctuation with commas before the guard and the history", () => {
  expect(withoutDashPunctuation("Você tem 2 leads \u2014 veja abaixo.")).toBe(
    "Você tem 2 leads, veja abaixo.",
  )
  expect(withoutDashPunctuation("Vendas\u2014hoje \u2013 R$ 55.000")).toBe(
    "Vendas, hoje, R$ 55.000",
  )
  expect(withoutDashPunctuation("Contato bem-sucedido, sem travessão.")).toBe(
    "Contato bem-sucedido, sem travessão.",
  )
  expect(
    finalizeAnswer(
      reply("CONVERSATION", "Você perguntou \u2014 quantos leads."),
      makeLinkCollector(),
      false,
    ).text,
  ).toBe("Você perguntou, quantos leads.")
})
