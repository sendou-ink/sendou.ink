import { requireUser } from "~/features/auth/core/user.server";
import * as ShowcaseTournaments from "~/features/front-page/core/ShowcaseTournaments.server";
import * as ScrimPostRepository from "~/features/scrims/ScrimPostRepository.server";
import {
	scrimToSidebarEvent,
	tournamentToSidebarEvent,
} from "~/features/sidebar/core/sidebar.server";
import * as SavedCalendarEventRepository from "~/features/tournament/SavedCalendarEventRepository.server";
import * as TournamentOrganizationRepository from "~/features/tournament-organization/TournamentOrganizationRepository.server";

export type EventsLoaderData = typeof loader;

export const loader = async () => {
	const user = requireUser();

	const [
		tournamentsData,
		scrimsData,
		savedTournaments,
		upcomingTournaments,
		userOrganizations,
	] = await Promise.all([
		ShowcaseTournaments.categorizedTournamentsByUserId(user.id),
		ScrimPostRepository.findUserScrims(user.id),
		SavedCalendarEventRepository.upcoming(user.id),
		ShowcaseTournaments.upcomingTournaments(),
		TournamentOrganizationRepository.findByUserId(user.id),
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

	const userOrganizationIds = new Set(userOrganizations.map((org) => org.id));
	const organization = upcomingTournaments
		.filter(
			(tournament) =>
				!tournament.hidden &&
				tournament.organizationId !== null &&
				userOrganizationIds.has(tournament.organizationId),
		)
		.map(tournamentToSidebarEvent)
		.sort((a, b) => a.startTime - b.startTime);

	return { registered, hosting, scrims, saved, organization };
};
