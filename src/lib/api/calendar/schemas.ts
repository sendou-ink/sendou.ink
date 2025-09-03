import z from 'zod';
import * as Fields from '$lib/form/fields';
import { m } from '$lib/paraglide/messages';
import { TOURNAMENT_MAP_PICKING_STYLES, userSelectableTags } from '$lib/constants/calendar';
import type { CalendarEventUserSelectableTag } from '$lib/server/db/tables';
import {
	calendarEventTagTranslations,
	tournamentMapPickingStylesTranslations
} from '$lib/utils/i18n';
import { id } from '$lib/schemas';
import { add } from 'date-fns';
import { modesShort, rankedModesShort } from '$lib/constants/in-game/modes';

const commonNewFields = {
	name: Fields.textFieldRequired({
		label: m.common_forms_name(),
		minLength: 2,
		maxLength: 100
	}),
	organization: Fields.customJsonFieldOptional(
		{
			label: m.slimy_these_pony_hope(),
			initialValue: null
		},
		z.preprocess((value) => (value ? Number(value) : undefined), id)
	),
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
	badges: Fields.customJsonFieldOptional(
		{
			label: m.org_edit_form_badges_title(),
			initialValue: []
		},
		z.array(z.number()) // xxx: correct schema & add form field
	)
};

export const newCalendarEventSchema = z.object({
	...commonNewFields,
	description: Fields.textAreaOptional({
		label: m.common_forms_description(),
		maxLength: 1_000
	}),
	dates: Fields.array({
		label: m.calendar_forms_dates(),
		min: 1,
		max: 5,
		field: Fields.datetime({
			max: add(new Date(), { years: 1 })
		})
	}),
	bracketUrl: Fields.textFieldRequired({
		label: m.calendar_forms_bracketUrl(),
		maxLength: 200,
		validate: 'url'
	}),
	mapPool: Fields.mapPool({
		label: m.calendar_forms_mapPool()
	}),
	eventIdToEdit: Fields.idConstantOptional()
});

export type NewCalendarEventData = z.infer<typeof newCalendarEventSchema>;

export const newTournamentSchema = z.object({
	...commonNewFields,
	description: Fields.textAreaOptional({
		label: m.common_forms_description(),
		bottomText: m.grassy_major_mare_link(),
		maxLength: 3_000
	}),
	rules: Fields.textAreaOptional({
		label: m.q_front_nav_rules_title(),
		bottomText: m.grassy_major_mare_link(),
		maxLength: 10_000
	}),
	startsAt: Fields.datetime({
		label: m.bold_east_capybara_walk(),
		max: add(new Date(), { years: 1 })
	}),
	// xxx: should be optional
	regClosesAt: Fields.datetime({
		label: m.knotty_tough_parrot_lead(),
		bottomText: m.small_kind_warbler_honor()
		// xxx: validate is before start date
	}),
	logo: Fields.imageOptional({
		dimensions: 'logo',
		label: m.tidy_real_elk_attend()
	}),
	minMembersPerTeam: Fields.select({
		items: (['4v4', '3v3', '2v2', '1v1'] as const).map((v) => ({ value: v, label: v }))
	}),
	// xxx: translations
	isRanked: Fields.toggle({
		label: 'Ranked',
		bottomText:
			'Ranked tournaments affect SP. Tournaments that don\'t have open registration (skill capped) or "gimmick tournaments" must always be hosted as unranked. Any tournament hosted during off-season is always unranked no matter what is chosen here.'
	}),
	disableSubsTab: Fields.toggle({
		label: 'Disable subs tab',
		bottomText: 'Prevents users from signing up as substitutes and hides the related tab.'
	}),
	autonomousSubs: Fields.toggle({
		label: 'Autonomous subs',
		bottomText:
			'If enabled teams can add subs on their own while the tournament is in progress. When disabled needs to be done by the organizers.'
	}),
	requireInGameNames: Fields.toggle({
		label: 'Require in-game names',
		bottomText:
			"If enabled players can't join the tournament without an in-game name (e.g. Sendou#1234). Players can't change the IGNs after the registration closes."
	}),
	isInvitational: Fields.toggle({
		label: 'Invitational',
		bottomText: 'No open registration or subs list. All teams must be added by the organizer.'
	}),
	strictDeadlines: Fields.toggle({
		label: 'Strict deadlines',
		bottomText:
			'Strict deadlines has 5 minutes less for the target time of each round (25min Bo3, 35min Bo5 compared to 30min Bo3, 40min Bo5 normal).'
	}),
	isTest: Fields.toggle({
		label: 'Test',
		bottomText:
			"Test tournaments don't appear on the calendar, don't send notifications to players, and won't show up in players' profiles or results"
	}),
	mapPickingStyle: Fields.select({
		label: 'Map picking style',
		items: TOURNAMENT_MAP_PICKING_STYLES.map((style) => ({
			value: style,
			label: tournamentMapPickingStylesTranslations[style]()
		}))
	}),
	// xxx: validate correct map pool set in respect to mapPickingStyle
	tieBreakerMapPool: Fields.mapPool({
		minCount: 1,
		maxCount: 1,
		label: m.common_maps_tieBreakerMapPool(),
		modes: [...rankedModesShort]
	}),
	mapPool: Fields.mapPool({
		label: m.common_maps_mapPool(),
		modes: [...modesShort]
	}),
	tournamentIdToEdit: Fields.idConstantOptional()
	// xxx: bracket progression
});

export type NewTournamentData = z.infer<typeof newTournamentSchema>;
