import type { LoaderFunctionArgs } from "react-router";
import * as CalendarRepository from "~/features/calendar/CalendarRepository.server";
import { requirePermission } from "~/modules/permissions/guards.server";
import { notFoundIfNullish, parseParams } from "~/utils/remix.server";
import { idObject } from "~/utils/schema";

export const loader = async (args: LoaderFunctionArgs) => {
	const params = parseParams({
		params: args.params,
		schema: idObject,
	});
	const event = notFoundIfNullish(await CalendarRepository.findById(params.id));

	requirePermission(event, "REPORT_WINNERS");

	return {
		name: event.name,
		participantCount: event.participantCount,
		winners: await CalendarRepository.findResultsByEventId(params.id),
	};
};
