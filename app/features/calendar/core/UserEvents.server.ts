/**
 * A user's upcoming events (tournaments, scrims, team events, league sets,
 * lobbies...) as listed on the events page and in their personal calendar feed.
 */
import * as R from "remeda";
import * as ShowcaseTournaments from "~/features/front-page/core/ShowcaseTournaments.server";
import * as ScrimPostRepository from "~/features/scrims/ScrimPostRepository.server";
import {
	findUpcomingLeagueMatches,
	findUpcomingLobbies,
	findUpcomingTeamEvents,
	leagueMatchToSidebarEvent,
	lobbyToSidebarEvent,
	type SidebarEvent,
	scrimToSidebarEvent,
	teamEventToSidebarEvent,
	tournamentToSidebarEvent,
} from "~/features/sidebar/core/sidebar.server";
import * as SavedCalendarEventRepository from "~/features/tournament/SavedCalendarEventRepository.server";
import * as TournamentOrganizationRepository from "~/features/tournament-organization/TournamentOrganizationRepository.server";
import type { ViewFilter } from "../calendar-search-params";

export type ByCategory = Record<ViewFilter, Array<SidebarEvent>>;

/** The user's upcoming events split into the views of the events page, each sorted by start time. */
export async function byCategory(userId: number): Promise<ByCategory> {
	const tournamentsData = await ShowcaseTournaments.upcomingOfUser(userId);
	const scrimsData = await ScrimPostRepository.findUserScrims(userId);
	const savedTournaments =
		await SavedCalendarEventRepository.findAllUpcomingByUserId(userId);
	const upcomingTournaments = await ShowcaseTournaments.upcomingTournaments();
	const userOrganizations =
		await TournamentOrganizationRepository.findByUserId(userId);
	const teamEvents = await findUpcomingTeamEvents(userId);
	const leagueMatches = await findUpcomingLeagueMatches(userId);
	const lobbies = await findUpcomingLobbies(userId);

	const userOrganizationIds = new Set(userOrganizations.map((org) => org.id));

	return {
		registered: sortByStart([
			...tournamentsData.participatingFor.map(tournamentToSidebarEvent),
			...leagueMatches.map(leagueMatchToSidebarEvent),
			...lobbies.map(lobbyToSidebarEvent),
		]),
		hosting: sortByStart(
			tournamentsData.organizingFor.map(tournamentToSidebarEvent),
		),
		scrims: sortByStart(scrimsData.map(scrimToSidebarEvent)),
		team: teamEvents.map(teamEventToSidebarEvent),
		saved: sortByStart(savedTournaments.map(tournamentToSidebarEvent)),
		organization: sortByStart(
			upcomingTournaments
				.filter(
					(tournament) =>
						!tournament.hidden &&
						tournament.organizationId !== null &&
						userOrganizationIds.has(tournament.organizationId),
				)
				.map(tournamentToSidebarEvent),
		),
	};
}

/**
 * The events the user is going to, for their calendar feed: everything of the events page
 * except scrim posts not yet booked and their organizations' tournaments they haven't joined.
 * An event in several views is included once.
 */
export function goingTo(events: ByCategory): Array<SidebarEvent> {
	return sortByStart(
		R.uniqueBy(
			[
				...events.registered,
				...events.hosting,
				...events.scrims.filter((event) => event.scrimStatus === "booked"),
				...events.team,
				...events.saved,
			],
			(event) => `${event.type}-${event.id}`,
		),
	);
}

function sortByStart(events: Array<SidebarEvent>) {
	return events.sort((a, b) => a.startsAt - b.startsAt);
}
