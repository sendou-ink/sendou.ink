import z from 'zod';
import * as Fields from '$lib/form/fields';
import { m } from '$lib/paraglide/messages';
import { tags } from '$lib/constants/calendar';
import type { CalendarEventTag } from '$lib/server/db/tables';

export const newCalendarEventSchema = z.object({
	name: Fields.textFieldRequired({
		label: m.common_forms_name(),
		minLength: 2,
		maxLength: 100
	}),
	description: Fields.textAreaOptional({
		label: m.common_forms_description(),
		maxLength: 3000
	}),
	// xxx: org
	// xxx: dates
	bracketUrl: Fields.textFieldRequired({
		// xxx: validate is url
		label: m.calendar_forms_bracketUrl(),
		maxLength: 200
	}),
	discordInviteCode: Fields.textFieldOptional({
		label: m.calendar_forms_discordInvite(),
		maxLength: 100,
		leftAddon: 'discord.gg/'
	}),
	// xxx: should be optional
	tags: Fields.checkboxGroup({
		label: m.calendar_forms_tags(),
		items: Object.keys(tags).map((tag) => ({
			value: tag as CalendarEventTag,
			label: tag
		}))
	}),
	// xxx: badges
	mapPool: Fields.mapPool({
		label: m.calendar_forms_mapPool()
	})
});
