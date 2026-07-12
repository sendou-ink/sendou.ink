import JSONCrush from "jsoncrush";
import { describe, expect, it } from "vitest";
import {
	type IngestVodMatchInput,
	ingestVodPrefillSchema,
} from "../ingest-vod-schemas";
import { prefillVodMatches, resolveVodMatches } from "./VodMatches";

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

describe("resolveVodMatches", () => {
	it("resolves English mode/stage names and weapon ids", () => {
		const { resolved, skippedCount } = resolveVodMatches({
			matches: [testMatch()],
			teamSize: 4,
		});

		expect(skippedCount).toBe(0);
		expect(resolved).toHaveLength(1);
		expect(resolved[0]).toMatchObject({
			startsAt: 30,
			mode: "SZ",
			weapons: [40, 40, 40, 40, 20, 20, 20, 20],
		});
		expect(typeof resolved[0]!.stageId).toBe("number");
	});

	it("skips a match whose mode did not read", () => {
		const { resolved, skippedCount } = resolveVodMatches({
			matches: [testMatch({ mode: null })],
			teamSize: 4,
		});
		expect(resolved).toHaveLength(0);
		expect(skippedCount).toBe(1);
	});

	it("skips a match whose stage is not a known name", () => {
		const { resolved, skippedCount } = resolveVodMatches({
			matches: [testMatch({ stage: "Not A Stage" })],
			teamSize: 4,
		});
		expect(resolved).toHaveLength(0);
		expect(skippedCount).toBe(1);
	});

	it("skips a match with an unreadable weapon", () => {
		const { resolved, skippedCount } = resolveVodMatches({
			matches: [testMatch({ weapons: [...WEAPONS.slice(0, 7), null] })],
			teamSize: 4,
		});
		expect(resolved).toHaveLength(0);
		expect(skippedCount).toBe(1);
	});

	it("skips a match with the wrong weapon count for the team size", () => {
		const { resolved, skippedCount } = resolveVodMatches({
			matches: [testMatch({ weapons: WEAPONS.slice(0, 6) })],
			teamSize: 4,
		});
		expect(resolved).toHaveLength(0);
		expect(skippedCount).toBe(1);
	});

	it("honours a non-default team size", () => {
		const { resolved } = resolveVodMatches({
			matches: [testMatch({ weapons: [40, 40, 20, 20] })],
			teamSize: 2,
		});
		expect(resolved).toHaveLength(1);
		expect(resolved[0]!.weapons).toHaveLength(4);
	});

	it("keeps good matches and skips bad ones in the same batch", () => {
		const { resolved, skippedCount } = resolveVodMatches({
			matches: [testMatch(), testMatch({ mode: null }), testMatch()],
			teamSize: 4,
		});
		expect(resolved).toHaveLength(2);
		expect(skippedCount).toBe(1);
	});
});

describe("prefillVodMatches", () => {
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

	it("resolves a fully read match like resolveVodMatches does", () => {
		const [prefilled] = prefillVodMatches([testMatch()]);
		const { resolved } = resolveVodMatches({
			matches: [testMatch()],
			teamSize: 4,
		});
		expect(prefilled).toEqual(resolved[0]);
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
