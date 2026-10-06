import { Seller } from "@crm/contract"
import { expect, it } from "vitest"
import { resolveSeller } from "./sellers.ts"

const sellers = [
  new Seller({ id: "ana-id", name: "Ana Souza" }),
  new Seller({ id: "bruno-id", name: "Bruno Lima" }),
  new Seller({ id: "jose-id", name: "José Pereira" }),
]

it("finds a seller by first name or full name, ignoring case", () => {
  expect(resolveSeller("ana", sellers)).toEqual({ _tag: "Found", id: "ana-id" })
  expect(resolveSeller("Bruno Lima", sellers)).toEqual({ _tag: "Found", id: "bruno-id" })
  expect(resolveSeller("  BRUNO  ", sellers)).toEqual({ _tag: "Found", id: "bruno-id" })
})

it("ignores accents on either side", () => {
  expect(resolveSeller("José", sellers)).toEqual({ _tag: "Found", id: "jose-id" })
  expect(resolveSeller("jose", sellers)).toEqual({ _tag: "Found", id: "jose-id" })
  expect(resolveSeller("jose pereira", sellers)).toEqual({ _tag: "Found", id: "jose-id" })
})

it("reports a first name shared by two sellers as ambiguous, unless the full name is given", () => {
  const twoAnas = [...sellers, new Seller({ id: "ana-2-id", name: "Ana Costa" })]
  expect(resolveSeller("ana", twoAnas)).toEqual({ _tag: "Ambiguous" })
  expect(resolveSeller("Ana Costa", twoAnas)).toEqual({ _tag: "Found", id: "ana-2-id" })
})

it("reports an unknown or empty name", () => {
  expect(resolveSeller("Carlos", sellers)).toEqual({ _tag: "Unknown" })
  expect(resolveSeller("   ", sellers)).toEqual({ _tag: "Unknown" })
  expect(resolveSeller("ana", [])).toEqual({ _tag: "Unknown" })
})
