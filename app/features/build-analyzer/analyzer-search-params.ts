import { z } from "zod";
import { EMPTY_BUILD } from "~/features/builds/builds-constants";
import { mainWeaponIds } from "~/modules/in-game-lists/weapon-ids";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";
import { numericEnum } from "~/utils/zod";
import { MAX_LDE_INTENSITY } from "./analyzer-constants";
import type { SpecialEffectType } from "./analyzer-types";
import { deserializeBuild, serializeBuild } from "./core/serializer";
import { SPECIAL_EFFECTS } from "./core/specialEffects";

export const serializedBuildCodec = z.codec(
	z.string(),
	z.custom<NonNullable<ReturnType<typeof deserializeBuild>>>(),
	{
		decode: (value, payload) => {
			const build = deserializeBuild(value);
			if (!build) {
				payload.issues.push({
					code: "custom",
					message: "Invalid serialized build",
					input: value,
				});
				return z.NEVER;
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
	lde: SP.param(z.number().int().min(0).max(MAX_LDE_INTENSITY), {
		default: 0,
		loader: false,
	}),
	effect: SP.param(z.array(z.enum(specialEffectTypes)), {
		default: [],
		loader: false,
	}),
	focused: SP.param(z.literal([1, 2, 3]), { default: 1, loader: false }),
});
