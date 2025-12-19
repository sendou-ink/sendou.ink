import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import * as R from "remeda";
import { requireUser } from "~/features/auth/core/user.server";
import * as BadgeRepository from "~/features/badges/BadgeRepository.server";
import * as CalendarRepository from "~/features/calendar/CalendarRepository.server";
import { tournamentData } from "~/features/tournament-bracket/core/Tournament.server";
import * as TournamentOrganizationRepository from "~/features/tournament-organization/TournamentOrganizationRepository.server";
import { requireRole } from "~/modules/permissions/guards.server";
import { tournamentBracketsPage } from "~/utils/urls";
import { canEditCalendarEvent } from "../calendar-utils";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = await requireUser(request);
	requireRole(user, "CALENDAR_EVENT_ADDER");

	const url = new URL(request.url);

	const eventWithTournament = async (key: string) => {
		const eventId = Number(url.searchParams.get(key));
		const event = Number.isNaN(eventId)
			? undefined
			: await CalendarRepository.findById(eventId, {
					includeMapPool: true,
					includeTieBreakerMapPool: true,
					includeBadgePrizes: true,
				});

		if (!event) return;

		if (!event?.tournamentId) return { ...event, tournament: null };

		return {
			...event,
			tournament: await tournamentData({
				tournamentId: event.tournamentId,
				user,
			}),
		};
	};

	const eventToEdit = await eventWithTournament("eventId");
	const canEditEvent = (() => {
		if (!eventToEdit) return false;
		if (
			eventToEdit.tournament?.ctx.organization?.members.some(
				(member) => member.userId === user.id && member.role === "ADMIN",
			)
		) {
			return true;
		}

		return canEditCalendarEvent({ user, event: eventToEdit });
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
			? await eventWithTournament("copyEventId")
			: undefined;

	const eventToCopy = eventToCopyRaw
		? {
				...eventToCopyRaw,
				badgePrizes: eventToCopyRaw.badgePrizes?.filter((badge) =>
					managedBadges.some((mb) => mb.id === badge.id),
				),
			}
		: undefined;

	return {
		isAddingTournament: Boolean(
			url.searchParams.has("tournament") ||
				url.searchParams.has("copyEventId") ||
				eventToEdit?.tournament,
		),
		managedBadges,
		eventToEdit: canEditEvent ? eventToEdit : undefined,
		eventToCopy,
		recentTournaments:
			canAddTournaments && !eventToEdit
				? await CalendarRepository.findRecentTournamentsByAuthorId(user.id)
				: undefined,
		organizations,
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
