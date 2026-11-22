import * as CalendarFeedRepository from "../CalendarFeedRepository.server";
import { eventsFeedSearchParams } from "../calendar-search-params";
import * as ICal from "../core/ICal.server";
import * as UserEvents from "../core/UserEvents.server";

export const loader = async ({ request }: { request: Request }) => {
	const { token } = eventsFeedSearchParams.parse(request);

	const userId = token
		? await CalendarFeedRepository.findUserIdByToken(token)
		: undefined;
	if (!userId) {
		return new Response(null, { status: 404 });
	}

	const events = UserEvents.goingTo(await UserEvents.byCategory(userId));

	const iCalData = ICal.feed({
		productId: "sendou.ink/events",
		name: "sendou.ink events",
		events: events.map(ICal.fromSidebarEvent),
	});

	if (iCalData === null) {
		return new Response(null, { status: 500 });
	}

	return new Response(iCalData, {
		status: 200,
		headers: {
			"Content-Type": "text/calendar",
		},
	});
};
