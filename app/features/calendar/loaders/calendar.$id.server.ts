import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { z } from "zod";
import * as CalendarRepository from "~/features/calendar/CalendarRepository.server";
import { notFoundIfFalsy } from "~/utils/remix.server";
import { tournamentPage } from "~/utils/urls";
import { actualNumber, id } from "~/utils/zod";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const parsedParams = z
		.object({ id: z.preprocess(actualNumber, id) })
		.parse(params);
	const event = notFoundIfFalsy(
		await CalendarRepository.findById({
			id: parsedParams.id,
			includeBadgePrizes: true,
			includeMapPool: true,
		}),
	);

	if (event.tournamentId) {
		throw redirect(tournamentPage(event.tournamentId));
	}

	return {
		event,
		results: await CalendarRepository.findResultsByEventId(parsedParams.id),
	};
};
