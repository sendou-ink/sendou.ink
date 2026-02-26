import { z } from "zod";
import { ART_SOURCES } from "~/features/art/art-types";
import { TIMEZONES } from "~/features/lfg/lfg-constants";
import {
	array,
	customField,
	numberField,
	select,
	selectDynamic,
	stageSelect,
	textAreaRequired,
	textFieldRequired,
	weaponPool,
	weaponSelect,
} from "~/form/fields";
import type { SelectOption } from "~/form/types";
import { USER } from "../../user-page-constants";

export const bioSchema = z.object({
	bio: textAreaRequired({
		label: "labels.bio",
		maxLength: USER.BIO_MAX_LENGTH,
	}),
});

export const bioMdSchema = z.object({
	bio: textAreaRequired({
		label: "labels.bio",
		bottomText: "bottomTexts.bioMarkdown" as never,
		maxLength: USER.BIO_MD_MAX_LENGTH,
	}),
});

export const xRankPeaksSchema = z.object({
	division: select({
		label: "labels.division" as never,
		items: [
			{ value: "both", label: "options.division.both" as never },
			{ value: "tentatek", label: "options.division.tentatek" as never },
			{ value: "takoroka", label: "options.division.takoroka" as never },
		],
	}),
});

export const timezoneSchema = z.object({
	timezone: selectDynamic({
		label: "labels.timezone" as never,
	}),
});

export const TIMEZONE_OPTIONS: SelectOption[] = TIMEZONES.map((tz) => ({
	value: tz,
	label: tz,
}));

export const favoriteStageSchema = z.object({
	stageId: stageSelect({
		label: "labels.favoriteStage" as never,
	}),
});

export const peakXpUnverifiedSchema = z.object({
	peakXp: numberField({
		label: "labels.peakXp" as never,
		minLength: 4,
		maxLength: 4,
	}),
	division: select({
		label: "labels.division" as never,
		items: [
			{ value: "tentatek", label: "options.division.tentatek" as never },
			{ value: "takoroka", label: "options.division.takoroka" as never },
		],
	}),
});

export const peakXpWeaponSchema = z.object({
	weaponSplId: weaponSelect({
		label: "labels.weapon" as never,
	}),
});

export const weaponPoolSchema = z.object({
	weapons: weaponPool({
		label: "labels.weaponPool",
		maxCount: USER.WEAPON_POOL_MAX_SIZE,
	}),
});

export const CONTROLLERS = [
	"s1-pro-con",
	"s2-pro-con",
	"grip",
	"handheld",
] as const;

export const sensSchema = z.object({
	controller: customField({ initialValue: "s2-pro-con" }, z.enum(CONTROLLERS)),
	motionSens: customField({ initialValue: null }, z.number().nullable()),
	stickSens: customField({ initialValue: null }, z.number().nullable()),
});

export const artSchema = z.object({
	source: select({
		label: "labels.artSource" as never,
		items: ART_SOURCES.map((source) => ({
			value: source,
			label: `options.artSource.${source}` as never,
		})),
	}),
});

export const linksSchema = z.object({
	links: array({
		label: "labels.urls",
		max: 10,
		field: textFieldRequired({
			maxLength: 150,
			validate: "url",
		}),
	}),
});

export const tierListSchema = z.object({
	searchParams: textFieldRequired({
		label: "labels.tierListUrl" as never,
		leftAddon: "/tier-list-maker?",
		maxLength: 500,
	}),
});

const WIDGET_FORM_SCHEMAS: Record<string, z.ZodObject<z.ZodRawShape>> = {
	bio: bioSchema,
	"bio-md": bioMdSchema,
	"x-rank-peaks": xRankPeaksSchema,
	timezone: timezoneSchema,
	"favorite-stage": favoriteStageSchema,
	"peak-xp-unverified": peakXpUnverifiedSchema,
	"peak-xp-weapon": peakXpWeaponSchema,
	"weapon-pool": weaponPoolSchema,
	sens: sensSchema,
	art: artSchema,
	links: linksSchema,
	"tier-list": tierListSchema,
};

export function getWidgetFormSchema(widgetId: string) {
	return WIDGET_FORM_SCHEMAS[widgetId];
}
