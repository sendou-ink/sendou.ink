import { resolve } from '$app/paths';
import { query } from '$app/server';
import type { NewCalendarEventData } from '$lib/api/calendar/schemas';
import { requirePermission } from '$lib/modules/permissions/guards.server';
import { id } from '$lib/schemas';
import * as CalendarRepository from '$lib/server/db/repositories/calendar';
import { notFoundIfFalsy } from '$lib/server/remote-functions';
import { redirect } from '@sveltejs/kit';

export const byId = query(id, async (id) => {
	const event = notFoundIfFalsy(
		await CalendarRepository.findById(id, {
			includeBadgePrizes: true,
			includeMapPool: true
		})
	);

	if (event.tournamentId) {
		redirect(308, resolve('/to/[id]', { id: String(event.tournamentId) }));
	}

	return {
		event,
		results: await CalendarRepository.findResultsByEventId(id)
	};
});

export const editCalendarEventFormData = query(id, async (id): Promise<NewCalendarEventData> => {
	const event = (await byId(id)).event;
	requirePermission(event, 'EDIT');

	return {
		bracketUrl: event.bracketUrl,
		dates: event.startTimes,
		description: event.description,
		discordInviteCode: event.discordInviteCode,
		mapPool: event.mapPool!,
		name: event.name,
		tags: event.tags,
		badges: [],
		organization: event.organization?.id,
		eventIdToEdit: id
	};
});
