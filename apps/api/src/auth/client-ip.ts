import { isIP } from "node:net"
import { Option } from "effect"
import type { HttpServerRequest } from "effect/unstable/http"

const unknownClient = "unknown"

const mappedIpv4Prefix = [0, 0, 0, 0, 0, 0xffff]

const expandIpv6 = (canonicalAddress: string): ReadonlyArray<number> => {
  const [head = "", tail] = canonicalAddress.split("::")
  const headGroups = head === "" ? [] : head.split(":")
  const tailGroups = tail === undefined || tail === "" ? [] : tail.split(":")
  const zeroGroups = tail === undefined ? 0 : 8 - headGroups.length - tailGroups.length
  return [...headGroups, ...Array.from({ length: zeroGroups }, () => "0"), ...tailGroups].map(
    (group) => Number.parseInt(group, 16),
  )
}

// One subscriber usually owns a whole IPv6 /64, so keying on the full address would let a single
// host rotate through its addresses to get a fresh limit bucket every time.
const clientKeyOf = (address: string) => {
  const trimmed = address.trim().toLowerCase()
  const version = trimmed.includes("%") ? 0 : isIP(trimmed)
  if (version === 4) return trimmed
  const hostUrl = `http://[${trimmed}]`
  if (version !== 6 || !URL.canParse(hostUrl)) return unknownClient
  // The URL parser rewrites an embedded IPv4 tail as hex and normalizes case and leading zeros.
  const groups = expandIpv6(new URL(hostUrl).hostname.slice(1, -1))
  // An IPv4-mapped address is the IPv4 client itself, so it shares that client's bucket.
  if (mappedIpv4Prefix.every((group, index) => groups[index] === group)) {
    const [high = 0, low = 0] = groups.slice(6)
    return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`
  }
  return `${groups
    .slice(0, 4)
    .map((group) => group.toString(16))
    .join(":")}::/64`
}

// The API is served through Cloudflare, which overwrites cf-connecting-ip on every request.
// X-Forwarded-For is not used: Render only appends to it, so a client can send its own values.
export const clientIpOf = (request: HttpServerRequest.HttpServerRequest) =>
  clientKeyOf(
    request.headers["cf-connecting-ip"] ??
      Option.getOrElse(request.remoteAddress, () => unknownClient),
  )
