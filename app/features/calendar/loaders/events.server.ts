import { requireUser } from "~/features/auth/core/user.server";
import * as ShowcaseTournaments from "~/features/front-page/core/ShowcaseTournaments.server";
import * as ScrimPostRepository from "~/features/scrims/ScrimPostRepository.server";
import {
	scrimToSidebarEvent,
	tournamentToSidebarEvent,
} from "~/features/sidebar/core/sidebar.server";
import * as SavedTournamentRepository from "~/features/tournament/SavedTournamentRepository.server";

export type EventsLoaderData = typeof loader;

export const loader = async () => {
	const user = requireUser();

	// xxx: should probably only load SavedTournamentRepository.upcoming (it can call to ShowcaseTournaments.upcomingTournaments as implementation detail)
	const [tournamentsData, scrimsData, savedTournamentIds, upcomingTournaments] =
		await Promise.all([
			ShowcaseTournaments.categorizedTournamentsByUserId(user.id),
			ScrimPostRepository.findUserScrims(user.id),
			SavedTournamentRepository.findTournamentIdsByUserId(user.id),
			ShowcaseTournaments.upcomingTournaments(),
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

	const savedTournamentIdSet = new Set(savedTournamentIds);
	const saved = upcomingTournaments
		.filter((t) => savedTournamentIdSet.has(t.id))
		.map(tournamentToSidebarEvent)
		.sort((a, b) => a.startTime - b.startTime);

	return { registered, hosting, scrims, saved };
};
