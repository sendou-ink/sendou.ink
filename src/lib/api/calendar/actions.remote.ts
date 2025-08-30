import { validatedForm } from '$lib/server/remote-functions';
import { newCalendarEventSchema } from './schemas';

export const upsertEvent = validatedForm(newCalendarEventSchema, async () => {});
