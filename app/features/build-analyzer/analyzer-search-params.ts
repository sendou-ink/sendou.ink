import * as v from "valibot";
import { EMPTY_BUILD } from "~/features/builds/builds-constants";
import { mainWeaponIds } from "~/modules/in-game-lists/weapon-ids";
import * as SearchParams from "~/modules/search-params/search-params";
import { codec, SP } from "~/modules/search-params/search-params";
import { numericEnum } from "~/utils/schema";
import { MAX_LDE_INTENSITY } from "./analyzer-constants";
import type { SpecialEffectType } from "./analyzer-types";
import { deserializeBuild, serializeBuild } from "./core/serializer";
import { SPECIAL_EFFECTS } from "./core/specialEffects";

export const serializedBuildCodec = codec(
	v.custom<NonNullable<ReturnType<typeof deserializeBuild>>>(() => true),
	{
		decode: (value) => {
			const build = deserializeBuild(value);
			if (!build) {
				return undefined;
			}
			return build;
		},
		encode: serializeBuild,
	},
);

const specialEffectTypes = SPECIAL_EFFECTS.map((effect) => effect.type) as [
	SpecialEffectType,
	...SpecialEffectType[],
];

export const analyzerSearchParams = SearchParams.define({
	weapon: SP.param(numericEnum(mainWeaponIds), { default: 0, loader: false }),
	build: SP.custom(serializedBuildCodec, {
		default: EMPTY_BUILD,
		loader: false,
	}),
	build2: SP.custom(serializedBuildCodec, {
		default: EMPTY_BUILD,
		loader: false,
	}),
	lde: SP.param(
		v.pipe(
			v.number(),
			v.integer(),
			v.minValue(0),
			v.maxValue(MAX_LDE_INTENSITY),
		),
		{
			default: 0,
			loader: false,
		},
	),
	effect: SP.param(v.array(v.picklist(specialEffectTypes)), {
		default: [],
		loader: false,
	}),
	focused: SP.param(v.picklist([1, 2, 3]), { default: 1, loader: false }),
});
