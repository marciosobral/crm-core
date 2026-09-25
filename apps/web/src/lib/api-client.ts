import { CrmApi } from "@crm/contract"
import { Effect } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import { HttpApiClient } from "effect/unstable/httpapi"

const baseUrl = import.meta.env.VITE_API_URL
if (!baseUrl) throw new Error("VITE_API_URL is not set")

const clientPromise = Effect.runPromise(
  HttpApiClient.make(CrmApi, { baseUrl }).pipe(Effect.provide(FetchHttpClient.layer)),
)

type Client = Awaited<typeof clientPromise>

export const runApi = <A, E>(request: (client: Client) => Effect.Effect<A, E>): Promise<A> =>
  clientPromise.then((client) => Effect.runPromise(request(client)))
