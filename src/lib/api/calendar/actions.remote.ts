import { requirePermission, requireRole } from '$lib/modules/permissions/guards.server';
import { validatedForm } from '$lib/server/remote-functions';
import { newCalendarEventSchema, newTournamentSchema } from './schemas';
import * as CalendarRepository from '$lib/server/db/repositories/calendar';
import { error, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import * as OrganizationAPI from '$lib/api/organization';
import { command } from '$app/server';
import { id } from '$lib/schemas';
import { byId } from '$lib/api/calendar/queries.remote';

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

export const upsertTournament = validatedForm(newTournamentSchema, async () => {
	requireRole('TOURNAMENT_ADDER');

	// xxx: upsert tournament logic here
});

export const deleteById = command(id, async (id) => {
	const event = (await byId(id)).event;
	requirePermission(event, 'EDIT');

	await CalendarRepository.deleteById({
		eventId: event.eventId
	});
});
