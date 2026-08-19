import * as v from "valibot";
import { ART_SOURCES } from "~/features/art/art-types";
import { TIMEZONES } from "~/features/lfg/lfg-constants";
import {
	array,
	customField,
	numberField,
	select,
	selectDynamic,
	stageSelect,
	textArea,
	textField,
	weaponSelect,
} from "~/form/fields";
import type { FormObjectSchema, SelectOption } from "~/form/types";
import { GAME_BADGE_IDS } from "~/modules/in-game-lists/game-badge-ids";
import { USER } from "../../user-page-constants";

export const bioSchema = v.object({
	bio: textArea({
		label: "labels.bio",
		maxLength: USER.BIO_MAX_LENGTH,
	}),
});

export const bioMdSchema = v.object({
	bio: textArea({
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

export const timezoneSchema = v.object({
	timezone: selectDynamic({
		label: "labels.timezone",
	}),
});

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
		minLength: 4,
		maxLength: 4,
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

const CONTROLLERS = ["s1-pro-con", "s2-pro-con", "grip", "handheld"] as const;

export const sensSchema = v.object({
	controller: select({
		label: "labels.controller",
		items: CONTROLLERS.map((controller) => ({
			value: controller,
			label: `options.controller.${controller}` as const,
		})),
		initialValue: "s2-pro-con",
	}),
	motionSens: customField({ initialValue: null }, v.nullable(v.number())),
	stickSens: customField({ initialValue: null }, v.nullable(v.number())),
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
		maxLength: 500,
		transformValue: pastedTierListUrlToSearchParams,
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

const WIDGET_FORM_SCHEMAS: Record<string, FormObjectSchema> = {
	bio: bioSchema,
	"bio-md": bioMdSchema,
	"x-rank-peaks": xRankPeaksSchema,
	timezone: timezoneSchema,
	"favorite-stage": favoriteStageSchema,
	"peak-xp-unverified": peakXpUnverifiedSchema,
	"peak-xp-weapon": peakXpWeaponSchema,
	sens: sensSchema,
	art: artSchema,
	links: linksSchema,
	"tier-list": tierListSchema,
	"game-badges": gameBadgesSchema,
	"game-badges-small": gameBadgesSmallSchema,
};

export function getWidgetFormSchema(widgetId: string) {
	return WIDGET_FORM_SCHEMAS[widgetId];
}

/** Lets the user paste a whole tier list maker URL instead of only its query string. */
function pastedTierListUrlToSearchParams(value: string) {
	if (!value.includes("/tier-list-maker")) return value;

	try {
		return new URL(value, "https://sendou.ink").search.substring(1);
	} catch {
		return value;
	}
}
