import { z } from "zod";
import { stageIds } from "~/modules/in-game-lists/stage-ids";
import { mainWeaponIds } from "~/modules/in-game-lists/weapon-ids";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";
import { modeShort, numericEnum } from "~/utils/zod";
import { videoMatchTypes } from "./vods-constants";

export const vodsSearchParams = SearchParams.define({
	page: SP.param(z.number().int().min(1).max(1000), {
		default: 1,
		loader: true,
	}),
	weapon: SP.param(numericEnum(mainWeaponIds).nullable(), {
		default: null,
		loader: true,
		resets: ["page"],
	}),
	mode: SP.param(modeShort.nullable(), {
		default: null,
		loader: true,
		resets: ["page"],
	}),
	stageId: SP.param(numericEnum(stageIds).nullable(), {
		default: null,
		loader: true,
		resets: ["page"],
	}),
	type: SP.param(z.enum(videoMatchTypes).nullable(), {
		default: null,
		loader: true,
		resets: ["page"],
	}),
});

export const vodsNewSearchParams = SearchParams.define({
	vod: SP.param(z.number().int().positive().nullable(), {
		default: null,
		loader: true,
	}),
});

export const vodsVodSearchParams = SearchParams.define({
	start: SP.param(z.number().int().min(0), { default: 0, loader: false }),
});

export const userVodsSearchParams = SearchParams.define({
	page: SP.param(z.number().int().min(1).max(1000), {
		default: 1,
		loader: true,
	}),
});
