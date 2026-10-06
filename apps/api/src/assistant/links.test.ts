import { expect, it } from "vitest"
import {
  makeLinkCollector,
  openDealLabel,
  openScreenLabel,
  resolveLinks,
  viewDealsLabel,
  viewLeadsLabel,
} from "./links.ts"

const deals = { kind: "VIEW_DEALS", label: "Ver 3 negócios no board", filters: {} } as const
const leads = { kind: "VIEW_LEADS", label: "Ver 2 leads", filters: {} } as const
const deal = {
  kind: "OPEN_DEAL",
  label: "Abrir Esteiras",
  dealId: "3f1c2a40-5b7e-4b9a-8c1d-0a1b2c3d4e5f",
} as const

it("attaches only the links the model named, in the order named", () => {
  const collector = makeLinkCollector()
  collector.add(deals)
  collector.add(leads)
  expect(resolveLinks(["L2"], collector)).toEqual([leads])
  expect(resolveLinks(["L2", "L1"], collector)).toEqual([leads, deals])
})

it("falls back to the default links when none is named", () => {
  const collector = makeLinkCollector()
  collector.add(deals)
  collector.add(leads)
  expect(resolveLinks([], collector)).toEqual([deals, leads])
})

it("offers a lazy link only when it is named", () => {
  const collector = makeLinkCollector()
  collector.add(deals)
  const dealId = collector.addLazy(deal)
  expect(resolveLinks([], collector)).toEqual([deals])
  expect(resolveLinks([dealId], collector)).toEqual([deal])
})

it("registers one link per destination, whatever its label", () => {
  const collector = makeLinkCollector()
  const first = collector.add({ ...deals, filters: { minValueCents: 1, statuses: ["NEW"] } })
  const second = collector.add({
    ...deals,
    label: "Outro texto",
    filters: { statuses: ["NEW"], minValueCents: 1 },
  })
  expect(second).toBe(first)
  expect(resolveLinks([first, second], collector)).toHaveLength(1)
})

it("caps the reply at three links", () => {
  const collector = makeLinkCollector()
  const ids = ["A", "B", "C", "D"].map((search) =>
    collector.add({ kind: "VIEW_LEADS", label: search, filters: { search } }),
  )
  expect(resolveLinks(ids, collector)).toHaveLength(3)
})

it("returns no links when nothing was collected", () => {
  expect(resolveLinks([], makeLinkCollector())).toEqual([])
})

it("describes deals with the number and context, never 'Ver no painel'", () => {
  expect(viewDealsLabel({}, 3, null)).toBe("Ver 3 negócios no board")
  expect(viewDealsLabel({ statuses: ["NEGOTIATION"], minValueCents: 5_000_000 }, 1, null)).toBe(
    "Ver 1 negócio em negociação ≥ R$ 50.000",
  )
  expect(viewDealsLabel({}, 2, "Ana Souza")).toBe("Ver 2 negócios de Ana Souza")
})

it("describes the idle, expected close and closed filters that were applied", () => {
  expect(viewDealsLabel({ idleDays: 10 }, 2, null)).toBe("Ver 2 negócios sem contato há 10+ dias")
  expect(viewDealsLabel({ closeFrom: "2026-10-01", closeTo: "2026-10-31" }, 2, null)).toBe(
    "Ver 2 negócios fecham de 01/10 a 31/10",
  )
  expect(
    viewDealsLabel(
      { statuses: ["WON"], closedFrom: "2026-10-06", closedTo: "2026-10-06" },
      1,
      null,
    ),
  ).toBe("Ver 1 negócio ganho (06/10)")
})

it("names the open and the closed groups of statuses", () => {
  expect(
    viewDealsLabel({ statuses: ["NEW", "CONTACTED", "PROPOSAL_SENT", "NEGOTIATION"] }, 4, null),
  ).toBe("Ver 4 negócios abertos")
  expect(viewDealsLabel({ statuses: ["WON", "LOST"] }, 5, null)).toBe(
    "Ver 5 negócios ganhos e perdidos",
  )
  expect(viewDealsLabel({ statuses: ["WON", "LOST"] }, 1, null)).toBe(
    "Ver 1 negócio ganho ou perdido",
  )
  expect(viewDealsLabel({ closeFrom: "2026-10-01" }, 2, null)).toBe(
    "Ver 2 negócios fecham a partir de 01/10",
  )
  expect(viewDealsLabel({ closeTo: "2026-10-31" }, 2, null)).toBe("Ver 2 negócios fecham até 31/10")
  expect(viewDealsLabel({ statuses: ["WON"] }, 5, null)).toBe("Ver 5 negócios ganhos")
  expect(viewDealsLabel({ statuses: ["LOST"] }, 1, null)).toBe("Ver 1 negócio perdido")
})

it("describes leads and screens", () => {
  expect(viewLeadsLabel({}, 2, null)).toBe("Ver 2 leads")
  expect(viewLeadsLabel({}, 1, null)).toBe("Ver 1 lead")
  expect(viewLeadsLabel({}, 2, "Ana Souza")).toBe("Ver 2 leads de Ana Souza")
  expect(viewLeadsLabel({ status: "WON" }, 1, null)).toBe("Ver 1 lead ganho")
  expect(openScreenLabel("NEW_LEAD")).toBe("Ir para Novo lead")
})

it("keeps labels within 52 characters, truncating titles with an ellipsis", () => {
  expect(openDealLabel("FitLife - 12 Esteiras")).toBe("Abrir FitLife - 12 Esteiras")
  const long = openDealLabel("Academia com um nome extremamente longo e cansativo")
  expect(Array.from(long)).toHaveLength(52)
  expect(long.endsWith("…")).toBe(true)
})
