import z from 'zod';
import * as Fields from '$lib/form/fields';
import { m } from '$lib/paraglide/messages';
import { tags } from '$lib/constants/calendar';
import type { CalendarEventTag } from '$lib/server/db/tables';
import { calendarEventTagTranslations } from '$lib/utils/i18n';

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
	date: Fields.datetime({
		label: m.calendar_forms_dates(),
		max: (() => {
			const result = new Date();
			result.setFullYear(result.getFullYear() + 1);
			return result;
		})()
	}),
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
	tags: Fields.checkboxGroup({
		label: m.calendar_forms_tags(),
		items: Object.keys(tags).map((tag) => ({
			value: tag as CalendarEventTag,
			label: calendarEventTagTranslations[tag as CalendarEventTag]()
		})),
		minLength: 0
	}),
	// xxx: badges
	mapPool: Fields.mapPool({
		label: m.calendar_forms_mapPool()
	})
});
