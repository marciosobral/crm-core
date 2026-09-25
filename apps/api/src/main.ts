import { NodeRuntime } from "@effect/platform-node"
import { Layer } from "effect"
import { ServerLive } from "./platform/server.ts"

Layer.launch(ServerLive).pipe(NodeRuntime.runMain)
