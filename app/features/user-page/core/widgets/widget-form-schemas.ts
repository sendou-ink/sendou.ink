import { addYears } from "date-fns";
import * as v from "valibot";
import { ART_SOURCES } from "~/features/art/art-types";
import { BADGE } from "~/features/badges/badges-constants";
import { TIMEZONES } from "~/features/lfg/lfg-constants";
import { tierListSearchParamsHaveItems } from "~/features/tier-list-maker/tier-list-maker-utils";
import {
	array,
	badges,
	customField,
	datetime,
	numberField,
	select,
	selectDynamic,
	stageSelect,
	textArea,
	textAreaOptional,
	textField,
	weaponPool,
	weaponSelect,
} from "~/form/fields";
import type { FormObjectSchema, SelectOption } from "~/form/types";
import { GAME_BADGE_IDS } from "~/modules/in-game-lists/game-badge-ids";
import { superRefine } from "~/utils/schema";
import { SENS_OPTIONS, USER } from "../../user-page-constants";

export const bioSchema = v.object({
	bio: textAreaOptional({
		label: "labels.bio",
		maxLength: USER.BIO_MAX_LENGTH,
	}),
});

export const bioMdSchema = v.object({
	bio: textAreaOptional({
		label: "labels.bio",
		bottomText: "bottomTexts.bioMarkdown",
		maxLength: USER.BIO_MD_MAX_LENGTH,
	}),
});

export const xRankPeaksSchema = v.object({
	division: select({
		label: "labels.division",
		items: [
			{ value: "both", label: "options.division.both" },
			{ value: "tentatek", label: "options.division.tentatek" },
			{ value: "takoroka", label: "options.division.takoroka" },
		],
	}),
});

export const timezoneSchema = v.pipe(
	v.object({
		timezone: selectDynamic({
			label: "labels.timezone",
		}),
	}),
	superRefine((data, ctx) => {
		if (TIMEZONES.includes(data.timezone)) return;

		ctx.addIssue({ message: "Invalid timezone", path: ["timezone"] });
	}),
);

export const TIMEZONE_OPTIONS: SelectOption[] = TIMEZONES.map((tz) => ({
	value: tz,
	label: tz,
}));

export const favoriteStageSchema = v.object({
	stageId: stageSelect({
		label: "labels.favoriteStage",
	}),
});

export const peakXpUnverifiedSchema = v.object({
	peakXp: numberField({
		label: "labels.peakXp",
		maxLength: 4,
		min: USER.PEAK_XP_MIN,
		max: USER.PEAK_XP_MAX,
	}),
	division: select({
		label: "labels.division",
		items: [
			{ value: "tentatek", label: "options.division.tentatek" },
			{ value: "takoroka", label: "options.division.takoroka" },
		],
	}),
});

export const peakXpWeaponSchema = v.object({
	weaponSplId: weaponSelect({
		label: "labels.weapon",
	}),
});

export const weaponPoolWidgetSchema = v.object({
	weaponPool: weaponPool({
		label: "labels.weaponPool",
		bottomText: "bottomTexts.weaponPoolWidget",
		maxCount: USER.WEAPON_POOL_WIDGET_MAX,
	}),
});

const CONTROLLERS = [
	"s1-pro-con",
	"s2-pro-con",
	"grip",
	"s2-grip",
	"s1-split-joycon",
	"s2-split-joycon",
	"handheld",
] as const;

const sensValueSchema = v.nullable(v.picklist(SENS_OPTIONS));

export const sensSchema = v.object({
	controller: select({
		label: "labels.controller",
		items: CONTROLLERS.map((controller) => ({
			value: controller,
			label: `options.controller.${controller}` as const,
		})),
	}),
	motionSens: customField({ initialValue: null }, sensValueSchema),
	stickSens: customField({ initialValue: null }, sensValueSchema),
});

export const artSchema = v.object({
	source: select({
		label: "labels.artSource",
		items: ART_SOURCES.map((source) => ({
			value: source,
			label: `options.artSource.${source}`,
		})),
	}),
});

export const linksSchema = v.object({
	links: array({
		label: "labels.urls",
		min: 1,
		max: 10,
		field: textField({
			maxLength: 150,
			validate: "url",
		}),
	}),
});

export const tierListSchema = v.object({
	searchParams: textField({
		label: "labels.tierListUrl",
		leftAddon: "/tier-list-maker?",
		maxLength: USER.TIER_LIST_WIDGET_MAX_LENGTH,
		transformValue: pastedTierListUrlToSearchParams,
		validate: {
			func: (value) =>
				tierListSearchParamsHaveItems(pastedTierListUrlToSearchParams(value)),
			message: "forms:errors.tierListUrlIncomplete",
		},
	}),
});

export const badgesOwnedSchema = v.object({
	favoriteBadgeIds: badges({
		label: "labels.profileFavoriteBadges",
		maxCount: BADGE.SMALL_BADGES_PER_DISPLAY_PAGE + 1,
	}),
});

const gameBadgeId = v.pipe(
	v.string(),
	v.check((val) => (GAME_BADGE_IDS as readonly string[]).includes(val)),
);

export const gameBadgesSchema = v.object({
	badgeIds: customField(
		{ initialValue: [] },
		v.pipe(v.array(gameBadgeId), v.maxLength(USER.GAME_BADGES_MAX)),
	),
});

export const gameBadgesSmallSchema = v.object({
	badgeIds: customField(
		{ initialValue: [] },
		v.pipe(v.array(gameBadgeId), v.maxLength(USER.GAME_BADGES_SMALL_MAX)),
	),
});

const COUNTDOWN_MAX_YEARS_AHEAD = 10;

export const countdownSchema = v.object({
	title: textField({
		label: "labels.title",
		maxLength: USER.COUNTDOWN_TITLE_MAX_LENGTH,
	}),
	date: datetime({
		label: "labels.date",
		max: () => addYears(new Date(), COUNTDOWN_MAX_YEARS_AHEAD),
	}),
});

export const markdownSchema = v.object({
	content: textArea({
		label: "labels.text",
		bottomText: "bottomTexts.bioMarkdown",
		maxLength: USER.MARKDOWN_WIDGET_MAX_LENGTH,
	}),
});

const WIDGET_FORM_SCHEMAS: Record<string, FormObjectSchema> = {
	bio: bioSchema,
	"bio-md": bioMdSchema,
	"x-rank-peaks": xRankPeaksSchema,
	timezone: timezoneSchema,
	"favorite-stage": favoriteStageSchema,
	"peak-xp-unverified": peakXpUnverifiedSchema,
	"peak-xp-weapon": peakXpWeaponSchema,
	"weapon-pool": weaponPoolWidgetSchema,
	sens: sensSchema,
	art: artSchema,
	links: linksSchema,
	"tier-list": tierListSchema,
	"badges-owned": badgesOwnedSchema,
	"game-badges": gameBadgesSchema,
	"game-badges-small": gameBadgesSmallSchema,
	countdown: countdownSchema,
	markdown: markdownSchema,
};

export function getWidgetFormSchema(widgetId: string) {
	return WIDGET_FORM_SCHEMAS[widgetId];
}

/** Lets the user paste a whole tier list maker URL instead of only its query string. */
function pastedTierListUrlToSearchParams(value: string) {
	if (!value.includes("/tier-list-maker")) return value;

	try {
		return new URL(value, "https://sendou.ink").search.slice(1);
	} catch {
		return value;
	}
}
