import * as v from "valibot";
import { DANGEROUS_CAN_ACCESS_DEV_CONTROLS } from "~/features/admin/core/dev-controls";
import { defineAction } from "~/form/define-action.server";
import { badRequest } from "~/utils/remix.server";

const runRoutineSchema = v.object({
	name: v.string(),
});

export const action = defineAction(
	{ body: runRoutineSchema, onInvalidBody: "badRequest" },
	async ({ body }) => {
		if (!DANGEROUS_CAN_ACCESS_DEV_CONTROLS) {
			badRequest();
		}

		const { everyHourAt00, everyHourAt30, daily, weekly, everyTwoMinutes } =
			await import("~/routines/list.server");
		const routine = [
			...everyHourAt00,
			...everyHourAt30,
			...daily,
			...weekly,
			...everyTwoMinutes,
		].find((candidate) => candidate.name === body.name);

		if (!routine) {
			throw new Response(`Unknown routine: ${body.name}`, { status: 400 });
		}

		await routine.run();

		return Response.json(null);
	},
);
