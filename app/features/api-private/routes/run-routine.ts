import type { ActionFunctionArgs } from "react-router";
import { DANGEROUS_CAN_ACCESS_DEV_CONTROLS } from "~/features/admin/core/dev-controls";

export const action = async ({ request }: ActionFunctionArgs) => {
	if (!DANGEROUS_CAN_ACCESS_DEV_CONTROLS) {
		throw new Response(null, { status: 400 });
	}

	const routineName = (await request.formData()).get("name");

	const { everyHourAt00, everyHourAt30, daily, everyTwoMinutes } = await import(
		"~/routines/list.server"
	);
	const routine = [
		...everyHourAt00,
		...everyHourAt30,
		...daily,
		...everyTwoMinutes,
	].find((routine) => routine.name === routineName);

	if (!routine) {
		throw new Response(`Unknown routine: ${routineName}`, { status: 400 });
	}

	await routine.run();

	return Response.json(null);
};
