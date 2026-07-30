import type { ActionFunction } from "react-router";
import { DANGEROUS_CAN_ACCESS_DEV_CONTROLS } from "~/features/admin/core/dev-controls";
import { refreshCaches } from "../core/refresh-caches.server";

export const action: ActionFunction = async () => {
	if (!DANGEROUS_CAN_ACCESS_DEV_CONTROLS) {
		throw new Response(null, { status: 400 });
	}

	const { seed } = await import("~/db/seed");
	await seed();

	await refreshCaches();

	return Response.json(null);
};
