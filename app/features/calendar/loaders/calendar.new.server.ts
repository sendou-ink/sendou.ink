import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import * as R from "remeda";
import { requireUser } from "~/features/auth/core/user.server";
import * as BadgeRepository from "~/features/badges/BadgeRepository.server";
import * as CalendarRepository from "~/features/calendar/CalendarRepository.server";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import { tournamentData } from "~/features/tournament-bracket/core/Tournament.server";
import { tournamentBracketsPage } from "~/features/tournament-bracket/tournament-bracket-urls";
import * as TournamentOrganizationRepository from "~/features/tournament-organization/TournamentOrganizationRepository.server";
import * as TrophyRepository from "~/features/trophies/TrophyRepository.server";
import { canAccessTrophies } from "~/features/trophies/trophies-utils";
import { requireRole } from "~/modules/permissions/guards.server";
import { hasPermission } from "~/modules/permissions/utils";
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
						includeTieBreakerMapPool: true,
						includeBadgePrizes: true,
						includeTrophy: true,
					});

		if (!event) return;

		if (!event?.tournamentId)
			return { ...event, tournament: null, rules: null };

		return {
			...event,
			tournament: await tournamentData(event.tournamentId),
			rules: await TournamentRepository.findRulesById(event.tournamentId),
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

	const managedBadges = await BadgeRepository.findManagedByUserId(user.id);

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

	const trophies = canAccessTrophies(user)
		? await TrophyRepository.findByOrganizationIds(validOrganizationIds)
		: [];

	const eventToCopy = eventToCopyRaw
		? {
				...eventToCopyRaw,
				badgePrizes: eventToCopyRaw.badgePrizes?.filter((badge) =>
					managedBadges.some((mb) => mb.id === badge.id),
				),
				trophy: eventToCopyRaw.trophy
					? trophies.some((t) => t.id === eventToCopyRaw.trophy?.id)
						? eventToCopyRaw.trophy
						: null
					: null,
			}
		: undefined;

	// plus already-attached prize badges the user no longer manages, so the selection still renders and stays removable
	const badgeOptions = R.uniqueBy(
		[...managedBadges, ...(eventToEdit?.badgePrizes ?? [])].map((badge) => ({
			id: badge.id,
			code: badge.code,
			displayName: badge.displayName,
			hue: badge.hue,
		})),
		(badge) => badge.id,
	);

	return {
		isAddingTournament: Boolean(
			tournament || copyEventId !== null || eventToEdit?.tournament,
		),
		managedBadges,
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

export async function findValidOrganizations(
	userId: number,
	isTournamentAdder: boolean,
) {
	const orgs = await TournamentOrganizationRepository.findByUserId(userId, {
		roles: ["ADMIN", "ORGANIZER"],
	});

	if (isTournamentAdder) {
		return [
			"NO_ORG",
			...orgs.map((org) =>
				R.omit(org, ["isEstablished", "role", "roleDisplayName"]),
			),
		];
	}

	return orgs
		.filter((org) => org.isEstablished)
		.map((org) => R.omit(org, ["isEstablished", "role", "roleDisplayName"]));
}
