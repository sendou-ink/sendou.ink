import { requireUser } from "~/features/auth/core/user.server";
import { myScheduleData } from "~/features/availability/core/MySchedule.server";
import * as ShowcaseTournaments from "~/features/front-page/core/ShowcaseTournaments.server";
import * as ScrimPostRepository from "~/features/scrims/ScrimPostRepository.server";
import {
	findUpcomingLeagueMatches,
	findUpcomingTeamEvents,
	leagueMatchToSidebarEvent,
	scrimToSidebarEvent,
	teamEventToSidebarEvent,
	tournamentToSidebarEvent,
} from "~/features/sidebar/core/sidebar.server";
import * as TeamRepository from "~/features/team/TeamRepository.server";
import * as SavedCalendarEventRepository from "~/features/tournament/SavedCalendarEventRepository.server";
import * as TournamentOrganizationRepository from "~/features/tournament-organization/TournamentOrganizationRepository.server";

export type EventsLoaderData = typeof loader;

export const loader = async () => {
	const user = requireUser();

	const tournamentsData =
		await ShowcaseTournaments.categorizedTournamentsByUserId(user.id);
	const ownScrims = await ScrimPostRepository.ownUpcoming().execute();
	const savedTournaments =
		await SavedCalendarEventRepository.findAllUpcomingByUserId(user.id);
	const upcomingTournaments = await ShowcaseTournaments.upcomingTournaments();
	const userOrganizations =
		await TournamentOrganizationRepository.organizations()
			.forMember(user.id)
			.execute();
	const mySchedule = await myScheduleData(user.id);
	const teamEvents = await findUpcomingTeamEvents(user.id);
	const leagueMatches = await findUpcomingLeagueMatches(user.id);
	const myTeams = await TeamRepository.teams().forMember(user.id).execute();

	const registered = [
		...tournamentsData.participatingFor.map(tournamentToSidebarEvent),
		...leagueMatches.map(leagueMatchToSidebarEvent),
	].sort((a, b) => a.startsAt - b.startsAt);

	const hosting = tournamentsData.organizingFor
		.map(tournamentToSidebarEvent)
		.sort((a, b) => a.startsAt - b.startsAt);

	const scrims = ownScrims
		.map((post) => scrimToSidebarEvent(post, user.id))
		.sort((a, b) => a.startsAt - b.startsAt);

	const team = teamEvents.map(teamEventToSidebarEvent);

	const saved = savedTournaments
		.map(tournamentToSidebarEvent)
		.sort((a, b) => a.startsAt - b.startsAt);

	const userOrganizationIds = new Set(userOrganizations.map((org) => org.id));
	const organization = upcomingTournaments
		.filter(
			(tournament) =>
				!tournament.hidden &&
				tournament.organizationId !== null &&
				userOrganizationIds.has(tournament.organizationId),
		)
		.map(tournamentToSidebarEvent)
		.sort((a, b) => a.startsAt - b.startsAt);

	return {
		registered,
		hosting,
		scrims,
		team,
		saved,
		organization,
		mySchedule,
		/** Audiences of the schedule visibility picker, alongside the user's friends. */
		myTeams: myTeams.map((myTeam) => ({ id: myTeam.id, name: myTeam.name })),
	};
};
