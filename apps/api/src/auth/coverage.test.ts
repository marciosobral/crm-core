import { Authorization, CrmApi } from "@crm/contract"
import { expect, it } from "@effect/vitest"
import { HttpApi } from "effect/unstable/httpapi"

const publicEndpoints = ["health.live", "health.ready", "auth.login"]

it("requires a session on every non-public endpoint", () => {
  const endpoints: Array<{ name: string; isProtected: boolean }> = []
  HttpApi.reflect(CrmApi, {
    onGroup: () => {},
    onEndpoint: ({ group, endpoint }) => {
      endpoints.push({
        name: `${group.identifier}.${endpoint.identifier}`,
        isProtected: endpoint.middlewares.has(Authorization),
      })
    },
  })
  expect(endpoints.map(({ name }) => name)).toContain("auth.me")
  for (const { name, isProtected } of endpoints) {
    expect({ name, isProtected }).toEqual({ name, isProtected: !publicEndpoints.includes(name) })
  }
})
