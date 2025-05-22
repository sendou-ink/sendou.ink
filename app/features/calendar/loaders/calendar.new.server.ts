import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
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
			: await CalendarRepository.findById({
					id: eventId,
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

	return {
		isAddingTournament: Boolean(
			url.searchParams.has("tournament") ||
				url.searchParams.has("copyEventId") ||
				eventToEdit?.tournament,
		),
		managedBadges: await BadgeRepository.findManagedByUserId(user.id),
		recentEventsWithMapPools:
			await CalendarRepository.findRecentMapPoolsByAuthorId(user.id),
		eventToEdit: canEditEvent ? eventToEdit : undefined,
		eventToCopy:
			user.roles.includes("TOURNAMENT_ADDER") && !eventToEdit
				? await eventWithTournament("copyEventId")
				: undefined,
		recentTournaments:
			user.roles.includes("TOURNAMENT_ADDER") && !eventToEdit
				? await CalendarRepository.findRecentTournamentsByAuthorId(user.id)
				: undefined,
		organizations: (
			await TournamentOrganizationRepository.findByOrganizerUserId(user.id)
		).concat(
			eventToEdit?.tournament?.ctx.organization
				? eventToEdit.tournament.ctx.organization
				: [],
		),
	};
};
