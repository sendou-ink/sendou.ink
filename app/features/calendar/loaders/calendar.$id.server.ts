import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import * as CalendarRepository from "~/features/calendar/CalendarRepository.server";
import { notFoundIfNullish, parseParams } from "~/utils/remix.server";
import { idObject } from "~/utils/schema";
import { tournamentPage } from "~/utils/urls";

export const loader = async (args: LoaderFunctionArgs) => {
	const params = parseParams({
		params: args.params,
		schema: idObject,
	});
	const event = notFoundIfNullish(
		await CalendarRepository.findById(params.id, {
			includeBadgePrizes: true,
			includeMapPool: true,
		}),
	);

	if (event.tournamentId) {
		throw redirect(tournamentPage(event.tournamentId));
	}

	return {
		event,
		results: await CalendarRepository.findResultsByEventId(params.id),
	};
};
