import * as v from "valibot";
import { ingestVodPrefillSchema } from "~/features/scanner-ingest/scanner-ingest-vod-schemas";
import { stageIds } from "~/modules/in-game-lists/stage-ids";
import { mainWeaponIds } from "~/modules/in-game-lists/weapon-ids";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";
import { modeShort, numericEnum } from "~/utils/schema";
import { videoMatchTypes } from "./vods-constants";

export const vodsSearchParams = SearchParams.define({
	page: SP.page(),
	weapon: SP.param(v.nullable(numericEnum(mainWeaponIds)), {
		loader: true,
		resets: ["page"],
	}),
	mode: SP.param(v.nullable(modeShort), {
		loader: true,
		resets: ["page"],
	}),
	stageId: SP.param(v.nullable(numericEnum(stageIds)), {
		loader: true,
		resets: ["page"],
	}),
	type: SP.param(v.nullable(v.picklist(videoMatchTypes)), {
		loader: true,
		resets: ["page"],
	}),
});

export const vodsNewSearchParams = SearchParams.define({
	vod: SP.param(v.nullable(v.pipe(v.number(), v.integer(), v.gtValue(0))), {
		loader: true,
	}),
	ingest: SP.json(v.nullable(ingestVodPrefillSchema), {
		loader: true,
		compress: true,
	}),
});

export const vodsVodSearchParams = SearchParams.define({
	start: SP.param(v.pipe(v.number(), v.integer(), v.minValue(0)), {
		default: 0,
		loader: false,
	}),
});

export const userVodsSearchParams = SearchParams.define({
	page: SP.page(),
});
