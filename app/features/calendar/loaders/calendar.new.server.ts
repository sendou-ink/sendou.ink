import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as Badges from "~/features/badges/core/Badges.server";
import * as CalendarRepository from "~/features/calendar/CalendarRepository.server";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import { tournamentData } from "~/features/tournament-bracket/core/Tournament.server";
import { tournamentBracketsPage } from "~/features/tournament-bracket/tournament-bracket-urls";
import * as TrophyRepository from "~/features/trophies/TrophyRepository.server";
import { requireRole } from "~/modules/permissions/guards.server";
import { hasPermission } from "~/modules/permissions/utils";
import { findValidOrganizations } from "../calendar-organizations.server";
import { calendarNewSearchParams } from "../calendar-search-params";

export const loader = async ({ url }: LoaderFunctionArgs) => {
	const user = requireUser();
	requireRole("CALENDAR_EVENT_ADDER");

	const { eventId, copyEventId, tournament } =
		calendarNewSearchParams.parse(url);

	const eventWithTournament = async (id: number | null) => {
		const event =
			id === null
				? undefined
				: await CalendarRepository.findById(id, {
						includeMapPool: true,
						includeBadgePrizes: true,
						includeTrophy: true,
					});

		if (!event) return;

		if (!event?.tournamentId)
			return {
				...event,
				tournament: null,
				rules: null,
				teamsHavePickedMaps: false,
			};

		const eventTournament = await tournamentData(event.tournamentId);

		return {
			...event,
			tournament: eventTournament,
			rules: await TournamentRepository.findRulesById(event.tournamentId),
			teamsHavePickedMaps:
				eventTournament?.ctx.teams.some((team) => team.hasMapPool) ?? false,
		};
	};

	const eventToEdit = await eventWithTournament(eventId);
	const canEditEvent = (() => {
		if (!eventToEdit) return false;
		if (eventToEdit.tournament) {
			return hasPermission(eventToEdit.tournament.ctx, "EDIT_EVENT_INFO", user);
		}

		return hasPermission(eventToEdit, "EDIT", user);
	})();

	// no editing tournament after the start
	if (
		eventToEdit?.tournament?.data.stage &&
		eventToEdit.tournament.data.stage.length > 0
	) {
		return redirect(
			tournamentBracketsPage({ tournamentId: eventToEdit.tournament.ctx.id }),
		);
	}

	const badgeOptions = await Badges.attachable({
		managerIds: [user.id],
		attached: eventToEdit?.badgePrizes ?? [],
	});

	const organizations = (
		await findValidOrganizations(
			user.id,
			user.roles.includes("TOURNAMENT_ADDER"),
		)
	).concat(
		eventToEdit?.tournament?.ctx.organization
			? eventToEdit.tournament.ctx.organization
			: [],
	);

	const canAddTournaments = organizations.length > 0;

	const eventToCopyRaw =
		canAddTournaments && !eventToEdit
			? await eventWithTournament(copyEventId)
			: undefined;

	const validOrganizationIds = organizations.flatMap((org) =>
		typeof org === "string" ? [] : [org.id],
	);

	const trophies =
		await TrophyRepository.findByOrganizationIds(validOrganizationIds);

	const eventToCopy = eventToCopyRaw
		? {
				...eventToCopyRaw,
				organization:
					eventToCopyRaw.organization &&
					validOrganizationIds.includes(eventToCopyRaw.organization.id)
						? eventToCopyRaw.organization
						: null,
				badgePrizes: eventToCopyRaw.badgePrizes?.filter((badge) =>
					badgeOptions.some((option) => option.id === badge.id),
				),
				trophy: eventToCopyRaw.trophy
					? trophies.some((t) => t.id === eventToCopyRaw.trophy?.id)
						? eventToCopyRaw.trophy
						: null
					: null,
			}
		: undefined;

	return {
		isAddingTournament: Boolean(
			tournament || copyEventId !== null || eventToEdit?.tournament,
		),
		badgeOptions,
		eventToEdit: canEditEvent ? eventToEdit : undefined,
		eventToCopy,
		recentTournaments:
			canAddTournaments && !eventToEdit
				? await CalendarRepository.findRecentTournamentsByOrganizerUserId(
						user.id,
					)
				: undefined,
		organizations,
		trophies,
	};
};
