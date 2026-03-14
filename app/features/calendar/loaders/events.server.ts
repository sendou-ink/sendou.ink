import { requireUser } from "~/features/auth/core/user.server";
import * as ShowcaseTournaments from "~/features/front-page/core/ShowcaseTournaments.server";
import * as ScrimPostRepository from "~/features/scrims/ScrimPostRepository.server";
import {
	scrimToSidebarEvent,
	tournamentToSidebarEvent,
} from "~/features/sidebar/core/sidebar.server";
import * as SavedCalendarEventRepository from "~/features/tournament/SavedCalendarEventRepository.server";

export type EventsLoaderData = typeof loader;

export const loader = async () => {
	const user = requireUser();

	const [tournamentsData, scrimsData, savedTournaments] = await Promise.all([
		ShowcaseTournaments.categorizedTournamentsByUserId(user.id),
		ScrimPostRepository.findUserScrims(user.id),
		SavedCalendarEventRepository.upcoming(user.id),
	]);

	const registered = tournamentsData.participatingFor
		.map(tournamentToSidebarEvent)
		.sort((a, b) => a.startTime - b.startTime);

	const hosting = tournamentsData.organizingFor
		.map(tournamentToSidebarEvent)
		.sort((a, b) => a.startTime - b.startTime);

	const scrims = scrimsData
		.map(scrimToSidebarEvent)
		.sort((a, b) => a.startTime - b.startTime);

	const saved = savedTournaments
		.map(tournamentToSidebarEvent)
		.sort((a, b) => a.startTime - b.startTime);

	return { registered, hosting, scrims, saved };
};
