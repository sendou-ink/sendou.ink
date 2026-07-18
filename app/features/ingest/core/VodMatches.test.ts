import JSONCrush from "jsoncrush";
import { describe, expect, it } from "vitest";
import {
	type IngestVodMatchInput,
	ingestVodPrefillSchema,
} from "../ingest-vod-schemas";
import { prefillVodMatches } from "./VodMatches";

// 8 real main weapon ids (4v4): Splattershot etc.
const WEAPONS = [40, 40, 40, 40, 20, 20, 20, 20];

function testMatch(
	partial: Partial<IngestVodMatchInput> = {},
): IngestVodMatchInput {
	return {
		startsAt: 30,
		mode: "Splat Zones",
		stage: "Scorch Gorge",
		weapons: WEAPONS,
		...partial,
	};
}

describe("prefillVodMatches", () => {
	it("resolves English mode/stage names and weapon ids", () => {
		const prefilled = prefillVodMatches([testMatch()]);

		expect(prefilled).toHaveLength(1);
		expect(prefilled[0]).toMatchObject({
			startsAt: 30,
			mode: "SZ",
			weapons: [40, 40, 40, 40, 20, 20, 20, 20],
		});
		expect(typeof prefilled[0]!.stageId).toBe("number");
	});

	it("resolves what it can and nulls the rest instead of skipping", () => {
		const prefilled = prefillVodMatches([
			testMatch({
				mode: null,
				stage: "Not A Stage",
				weapons: [...WEAPONS.slice(0, 7), null],
			}),
		]);

		expect(prefilled).toHaveLength(1);
		expect(prefilled[0]).toMatchObject({
			startsAt: 30,
			mode: null,
			stageId: null,
			weapons: [40, 40, 40, 40, 20, 20, 20, null],
		});
	});

	it("accepts the JSONCrushed `ingest` search param emberz sends", () => {
		// what emberz's "Upload to sendou.ink" button puts in the param
		// (src/ui/sendou-upload.ts): a crushed { type?, matches } payload
		const param = JSONCrush.crush(
			JSON.stringify({ type: "CAST", matches: [testMatch()] }),
		);

		const parsed = ingestVodPrefillSchema.safeParse(
			JSON.parse(JSONCrush.uncrush(param)),
		);

		expect(parsed.success).toBe(true);
		expect(parsed.data!.type).toBe("CAST");
		expect(prefillVodMatches(parsed.data!.matches)).toHaveLength(1);
	});
});
