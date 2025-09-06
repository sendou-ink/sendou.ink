import z from 'zod';
import * as Fields from '$lib/form/fields';
import { m } from '$lib/paraglide/messages';
import { TOURNAMENT_MAP_PICKING_STYLES, userSelectableTags } from '$lib/constants/calendar';
import type { CalendarEventUserSelectableTag } from '$lib/server/db/tables';
import {
	calendarEventTagTranslations,
	tournamentMapPickingStylesTranslations
} from '$lib/utils/i18n';
import { id, safeJSONParse } from '$lib/utils/zod';
import { add } from 'date-fns';
import { modesShort, rankedModesShort } from '$lib/constants/in-game/modes';
import * as R from 'remeda';
import { TOURNAMENT } from '$lib/constants/tournament';
import * as Progression from '$lib/core/tournament-bracket/Progression';

const commonNewFields = {
	name: Fields.textFieldRequired({
		label: m.common_forms_name(),
		minLength: 2,
		maxLength: 100
	}),
	organization: Fields.customJsonField(
		{
			label: m.slimy_these_pony_hope(),
			initialValue: null
		},
		z.preprocess((value) => (value ? Number(value) : undefined), id.optional())
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
	badges: Fields.customJsonField(
		{
			label: m.org_edit_form_badges_title(),
			initialValue: []
		},
		z.array(z.number()).optional() // xxx: correct schema & add form field
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
		field: Fields.datetimeRequired({
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

const bracketProgressionSchema = z.preprocess(
	safeJSONParse,
	z
		.array(
			z.object({
				type: z.enum(TOURNAMENT.STAGE_TYPES),
				name: z.string().min(1).max(TOURNAMENT.BRACKET_NAME_MAX_LENGTH),
				settings: z.object({
					thirdPlaceMatch: z.boolean().optional(),
					teamsPerGroup: z.number().int().optional(),
					groupCount: z.number().int().optional(),
					roundCount: z.number().int().optional()
				}),
				requiresCheckIn: z.boolean(),
				startTime: z.date().optional(),
				sources: z
					.array(
						z.object({
							bracketIdx: z.number(),
							placements: z.array(z.number())
						})
					)
					.optional()
			})
		)
		.refine(
			(progression) => Progression.bracketsToValidationError(progression) === null,
			'Invalid bracket progression'
		)
);

export const newTournamentSchema = z
	.object({
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
		startsAt: Fields.datetimeRequired({
			label: m.bold_east_capybara_walk(),
			max: add(new Date(), { years: 1 })
		}),
		regClosesAt: Fields.datetimeOptional({
			label: m.knotty_tough_parrot_lead(),
			bottomText: m.small_kind_warbler_honor()
		}),
		logo: Fields.imageOptional({
			dimensions: 'logo',
			label: m.tidy_real_elk_attend()
		}),
		minMembersPerTeam: Fields.select({
			label: m.plane_big_gecko_lead(),
			items: (['4v4', '3v3', '2v2', '1v1'] as const).map((v) => ({ value: v, label: v }))
		}),
		isRanked: Fields.toggle({
			label: m.deft_red_platypus_fall(),
			bottomText: m.ago_grassy_skate_tap()
		}),
		disableSubsTab: Fields.toggle({
			label: m.clean_great_orangutan_nudge(),
			bottomText: m.gaudy_wacky_coyote_succeed()
		}),
		autonomousSubs: Fields.toggle({
			label: m.loved_grassy_jannes_pull(),
			bottomText: m.curly_spry_wolf_swim()
		}),
		requireInGameNames: Fields.toggle({
			label: m.any_simple_flamingo_launch(),
			bottomText: m.proof_such_llama_hush()
		}),
		isInvitational: Fields.toggle({
			label: m.grassy_crazy_dog_launch(),
			bottomText: m.free_fair_carp_aid()
		}),
		strictDeadlines: Fields.toggle({
			label: m.active_polite_oryx_borrow(),
			bottomText: m.lost_drab_mole_evoke()
		}),
		isTest: Fields.toggle({
			label: m.wild_awake_elk_gasp(),
			bottomText: m.real_dirty_kangaroo_accept()
		}),
		mapPickingStyle: Fields.select({
			label: m.odd_teal_kangaroo_trip(),
			items: TOURNAMENT_MAP_PICKING_STYLES.map((style) => ({
				value: style,
				label: tournamentMapPickingStylesTranslations[style]()
			}))
		}),
		tieBreakerMapPool: Fields.mapPool({
			maxCount: 1,
			label: m.common_maps_tieBreakerMapPool(),
			modes: [...rankedModesShort]
		}),
		mapPool: Fields.mapPool({
			label: m.common_maps_mapPool(),
			modes: [...modesShort]
		}),
		tournamentIdToEdit: Fields.idConstantOptional(),
		bracketProgression: Fields.customJsonField(
			{
				initialValue: null
			},
			bracketProgressionSchema
		)
	})
	.refine(
		(data) => {
			if (!data.regClosesAt) return true;
			return data.regClosesAt < data.startsAt;
		},
		{
			error: m.day_maroon_crab_gulp(),
			path: ['regClosesAt']
		}
	)
	.refine(
		(data) => {
			if (data.mapPickingStyle !== 'AUTO_ALL') return true;

			for (const mode of rankedModesShort) {
				if (!data.tieBreakerMapPool[mode] || data.tieBreakerMapPool[mode].length !== 1)
					return false;
			}

			return true;
		},
		{
			error: m.spicy_yummy_ox_quiz(),
			path: ['tieBreakerMapPool']
		}
	)
	.refine(
		(data) => {
			if (data.mapPickingStyle !== 'AUTO_ALL') return true;

			const allStages = Object.values(data.tieBreakerMapPool).flat();

			return allStages.length === R.unique(allStages).length;
		},
		{
			error: m.busy_fun_pig_quiz(),
			path: ['tieBreakerMapPool']
		}
	);

export type NewTournamentData = z.infer<typeof newTournamentSchema>;
