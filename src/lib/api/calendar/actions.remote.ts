import { requireRole } from '$lib/modules/permissions/guards.server';
import { validatedForm } from '$lib/server/remote-functions';
import { logger } from '$lib/utils/logger';
import { newCalendarEventSchema } from './schemas';

export const upsertEvent = validatedForm(newCalendarEventSchema, async (data) => {
	requireRole('CALENDAR_EVENT_ADDER');

	logger.info('data', data);
});
