import { Main } from "~/components/Main";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { CALENDAR_PAGE, navIconUrl } from "~/utils/urls";

import { loader } from "../loaders/calendar.server";
export { loader };

// xxx: restore
// export const meta: MetaFunction = (args) => {
// 	const data = args.data as SerializeFrom<typeof loader> | null;

// 	if (!data) return [];

// 	const events = data.events.slice().sort((a, b) => {
// 		const aParticipants = a.participantCounts?.teams ?? 0;
// 		const bParticipants = b.participantCounts?.teams ?? 0;

// 		if (aParticipants > bParticipants) return -1;
// 		if (aParticipants < bParticipants) return 1;

// 		return 0;
// 	});

// 	return metaTags({
// 		title: "Calendar",
// 		ogTitle: "Splatoon competitive event calendar",
// 		location: args.location,
// 		description: `${data.events.length} events on sendou.ink happening during week ${
// 			data.displayedWeek
// 		} including ${joinListToNaturalString(
// 			events.slice(0, 3).map((e) => e.name),
// 		)}`,
// 	});
// };

export const handle: SendouRouteHandle = {
	i18n: "calendar",
	breadcrumb: () => ({
		imgPath: navIconUrl("calendar"),
		href: CALENDAR_PAGE,
		type: "IMAGE",
	}),
};

export default function CalendarPage() {
	return <Main>hello!</Main>;
}
