import { validatedForm } from '$lib/server/remote-functions';
import { logger } from '$lib/utils/logger';
import { newCalendarEventSchema } from './schemas';

export const upsertEvent = validatedForm(newCalendarEventSchema, async (data) => {
	logger.info('data', data);
});
