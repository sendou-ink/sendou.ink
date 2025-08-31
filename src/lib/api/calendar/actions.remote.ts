import { requireRole } from '$lib/modules/permissions/guards.server';
import { validatedForm } from '$lib/server/remote-functions';
import { newCalendarEventSchema } from './schemas';
import * as CalendarRepository from '$lib/server/db/repositories/calendar';
import { error, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import * as OrganizationAPI from '$lib/api/organization';

export const upsertEvent = validatedForm(newCalendarEventSchema, async (data, user) => {
	requireRole('CALENDAR_EVENT_ADDER');

	if (data.organization) {
		const validOrgs = await OrganizationAPI.queries.byLoggedInUserOrganizerOf();
		if (!validOrgs.some((org) => org.id === data.organization)) error(400);
	}

	const eventId = await CalendarRepository.create({ ...data, userId: user.id });

	redirect(303, resolve('/calendar/[id]', { id: String(eventId) }));
});
