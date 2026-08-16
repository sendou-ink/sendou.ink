import { error, json } from "@sveltejs/kit";
import { DANGEROUS_CAN_ACCESS_DEV_CONTROLS } from "#lib/features/admin/dev-controls.server.ts";
import type { RequestHandler } from "./$types";

// grows as routines are ported with their features (svelte-big-bang.md phase 4+)
const routines = new Map<string, () => Promise<void>>();

export const POST: RequestHandler = async ({ request }) => {
	if (!DANGEROUS_CAN_ACCESS_DEV_CONTROLS) {
		error(400, "Dev controls are not available");
	}

	const form = new URLSearchParams(await request.text());
	const name = form.get("name");

	const routine = name ? routines.get(name) : undefined;
	if (!routine) {
		error(400, `Unknown routine: ${name ?? "(missing)"}`);
	}

	await routine();

	return json({ success: true });
};
