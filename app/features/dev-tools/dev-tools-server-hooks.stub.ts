import type { DevToolsServerHooks } from "./dev-tools-server-hooks.server";

/** Stands in for `dev-tools-server-hooks.server.ts` in production builds, see `vite.config.ts`. */
export const devToolsServerHooks: DevToolsServerHooks | null = null;
