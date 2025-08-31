import z from 'zod';
import * as Fields from '$lib/form/fields';
import { m } from '$lib/paraglide/messages';
import { userSelectableTags } from '$lib/constants/calendar';
import type { CalendarEventUserSelectableTag } from '$lib/server/db/tables';
import { calendarEventTagTranslations } from '$lib/utils/i18n';
import { id } from '$lib/schemas';

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
	organizationId: Fields.customJsonFieldOptional(
		{
			label: m.slimy_these_pony_hope()
		},
		z.preprocess((value) => (value ? Number(value) : undefined), id)
	),
	dates: Fields.array({
		label: m.calendar_forms_dates(),
		min: 1,
		max: 5,
		field: Fields.datetime({
			max: (() => {
				const result = new Date();
				result.setFullYear(result.getFullYear() + 1);
				return result;
			})()
		})
	}),
	bracketUrl: Fields.textFieldRequired({
		label: m.calendar_forms_bracketUrl(),
		maxLength: 200,
		validate: 'url'
	}),
	discordInviteCode: Fields.textFieldOptional({
		label: m.calendar_forms_discordInvite(),
		maxLength: 100,
		leftAddon: 'discord.gg/'
	}),
	tags: Fields.checkboxGroup({
		label: m.calendar_forms_tags(),
		items: userSelectableTags.map((tag) => ({
			value: tag as CalendarEventUserSelectableTag,
			label: calendarEventTagTranslations[tag as CalendarEventUserSelectableTag]()
		})),
		minLength: 0
	}),
	// xxx: badges
	mapPool: Fields.mapPool({
		label: m.calendar_forms_mapPool()
	})
});
