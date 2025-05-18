import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import * as CalendarRepository from "~/features/calendar/CalendarRepository.server";
import { notFoundIfFalsy, parseParams } from "~/utils/remix.server";
import { tournamentPage } from "~/utils/urls";
import { idObject } from "~/utils/zod";

export const loader = async (args: LoaderFunctionArgs) => {
	const params = parseParams({
		params: args.params,
		schema: idObject,
	});
	const event = notFoundIfFalsy(
		await CalendarRepository.findById({
			id: params.id,
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
