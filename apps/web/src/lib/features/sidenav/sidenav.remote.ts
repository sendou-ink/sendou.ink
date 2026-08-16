import * as v from "valibot";
import { form, getRequestEvent } from "$app/server";
import { writeSidenavCollapsed } from "./sidenav.server.ts";

/** Persists whether the desktop sidenav is collapsed. */
export const setSidenavCollapsed = form(
	v.object({ collapsed: v.optional(v.boolean(), false) }),
	async ({ collapsed }) => {
		writeSidenavCollapsed(getRequestEvent().cookies, collapsed);
	},
);
