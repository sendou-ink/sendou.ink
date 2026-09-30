import { TZDate } from "@date-fns/tz";
import { addDays, differenceInSeconds, startOfDay } from "date-fns";
import * as UserRepository from "~/features/user-page/UserRepository.server";

const MAX_CACHE_SECONDS = 60 * 60 * 4;

export type PatronsListLoaderData = {
	patrons: Awaited<ReturnType<typeof UserRepository.findAllPatronsForFooter>>;
};

export const loader = async () => {
	return Response.json(
		{
			patrons: await UserRepository.findAllPatronsForFooter(),
		},
		{
			headers: {
				"Cache-Control": `public, max-age=${cacheSeconds()}`,
			},
		},
	);
};

/** Patron order is shuffled anew each UTC day, so caching never outlives the current one. */
function cacheSeconds() {
	const now = new Date();
	const nextUtcMidnight = addDays(startOfDay(new TZDate(now, "UTC")), 1);

	return Math.min(MAX_CACHE_SECONDS, differenceInSeconds(nextUtcMidnight, now));
}
