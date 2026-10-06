import { expect, it } from "@effect/vitest"
import { Option } from "effect"
import { HttpServerRequest } from "effect/unstable/http"
import { clientIpOf } from "./client-ip.ts"

const requestWith = (headers: Record<string, string>, remoteAddress?: string) => {
  const request = HttpServerRequest.fromWeb(new Request("http://localhost/auth/login", { headers }))
  return remoteAddress === undefined
    ? request
    : request.modify({ remoteAddress: Option.some(remoteAddress) })
}

it("prefers cf-connecting-ip and ignores x-forwarded-for", () => {
  const request = requestWith(
    { "cf-connecting-ip": "203.0.113.1", "x-forwarded-for": "198.51.100.9" },
    "10.0.0.1",
  )
  expect(clientIpOf(request)).toBe("203.0.113.1")
})

it("falls back to the remote address, then to unknown", () => {
  expect(clientIpOf(requestWith({ "x-forwarded-for": "198.51.100.9" }, "10.0.0.1"))).toBe(
    "10.0.0.1",
  )
  expect(clientIpOf(requestWith({}))).toBe("unknown")
})

const clientKeyOf = (address: string) => clientIpOf(requestWith({ "cf-connecting-ip": address }))

it("keeps IPv4 addresses as they are", () => {
  expect(clientKeyOf("203.0.113.7")).toBe("203.0.113.7")
})

it("maps IPv4-mapped IPv6 addresses to the IPv4 address", () => {
  expect(clientKeyOf("::ffff:203.0.113.7")).toBe("203.0.113.7")
  expect(clientKeyOf("::FFFF:cb00:7107")).toBe("203.0.113.7")
})

it("keys IPv6 addresses on their /64, expanded and lowercase", () => {
  const key = clientKeyOf("2001:db8:1:2:aaaa:bbbb:cccc:dddd")
  expect(clientKeyOf("2001:DB8:1:2::1")).toBe(key)
  expect(clientKeyOf("2001:db8:1:2:0:0:0:ffff")).toBe(key)
  expect(clientKeyOf("2001:db8:1:3::1")).not.toBe(key)
  expect(clientKeyOf("2001:db8::1")).toBe(clientKeyOf("2001:0db8:0:0:5::9"))
  expect(clientKeyOf("2001:db8:1:2::1.2.3.4")).toBe(key)
  expect(clientKeyOf("::1")).toBe(clientKeyOf("0:0:0:0:1::2"))
})

it("falls back to unknown for values that are not IP addresses", () => {
  expect(clientKeyOf("not-an-ip")).toBe("unknown")
  expect(clientKeyOf("2001:db8::1%eth0")).toBe("unknown")
  expect(clientKeyOf("")).toBe("unknown")
})
