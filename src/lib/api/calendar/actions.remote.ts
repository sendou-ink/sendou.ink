import { requirePermission, requireRole } from '$lib/modules/permissions/guards.server';
import { validatedForm } from '$lib/server/remote-functions';
import { newCalendarEventSchema, newTournamentSchema } from './schemas';
import * as CalendarRepository from '$lib/server/db/repositories/calendar';
import { error, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import * as OrganizationAPI from '$lib/api/organization';
import { command } from '$app/server';
import { id } from '$lib/utils/zod';
import { byId } from '$lib/api/calendar/queries.remote';
import * as ShowcaseTournaments from '$lib/core/tournament/ShowcaseTournament.server';
import { clearTournamentDataCache } from '../tournament/utils.server';

export const upsertEvent = validatedForm(newCalendarEventSchema, async (data, user) => {
	requireRole('CALENDAR_EVENT_ADDER');

	if (data.organization) {
		const validOrgs = await OrganizationAPI.queries.byLoggedInUserOrganizerOf();
		if (!validOrgs.some((org) => org.id === data.organization)) error(400);
	}

	let eventId = data.eventIdToEdit;
	if (data.eventIdToEdit) {
		const event = (await byId(data.eventIdToEdit)).event;
		requirePermission(event, 'EDIT');

		await CalendarRepository.update({ ...data, eventId: data.eventIdToEdit });
	} else {
		eventId = await CalendarRepository.create({ ...data, userId: user.id });
	}

	redirect(303, resolve('/calendar/[id]', { id: String(eventId) }));
});

// xxx: could we adapt event based architecture for clearing caches and sending notifications?

export const upsertTournament = validatedForm(newTournamentSchema, async (data, user) => {
	requireRole('TOURNAMENT_ADDER'); // xxx: don't require if editing and can edit the tournament

	let tournamentId = data.tournamentIdToEdit;
	if (data.tournamentIdToEdit) {
		// xxx: if editing, check !tournament.hasStarted
		// xxx: check has edit perms if editing
		// await CalendarRepository.update({
		// 		eventId: data.eventToEditId,
		// 		mapPoolMaps: deserializedMaps,
		// 		...commonArgs,
		// 	});
		clearTournamentDataCache(data.tournamentIdToEdit);
		ShowcaseTournaments.clearParticipationInfoMap();
	} else {
		tournamentId = await CalendarRepository.createTournament({ ...data, userId: user.id });

		clearTournamentDataCache(tournamentId);
		ShowcaseTournaments.clearParticipationInfoMap();
		ShowcaseTournaments.clearCachedTournaments();
		// if (data.isTest) {
		// 	notify({
		// 		notification: {
		// 			type: "TO_TEST_CREATED",
		// 			meta: {
		// 				tournamentName: data.name,
		// 				tournamentId: createdTournamentId,
		// 			},
		// 		},
		// 		defaultSeenUserIds: [user.id],
		// 		userIds: [user.id],
		// 	});
		// }
	}

	redirect(303, resolve('/to/[id]', { id: String(tournamentId) }));
});

export const deleteById = command(id, async (id) => {
	const event = (await byId(id)).event;
	requirePermission(event, 'EDIT');

	await CalendarRepository.deleteById(event.eventId);
});
