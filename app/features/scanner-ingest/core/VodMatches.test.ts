import * as v from "valibot";
import { describe, expect, test } from "vitest";
import { vodsNewSearchParams } from "~/features/vods/vods-search-params";
import {
	type IngestVodMatchInput,
	ingestVodPrefillSchema,
} from "../scanner-ingest-vod-schemas";
import { prefillVodMatches } from "./VodMatches";

// 8 real main weapon ids (4v4): Splattershot etc.
const WEAPONS: IngestVodMatchInput["weapons"] = [
	40, 40, 40, 40, 20, 20, 20, 20,
];

function testMatch(
	partial: Partial<IngestVodMatchInput> = {},
): IngestVodMatchInput {
	return {
		startsAt: 30,
		mode: "SZ",
		stage: 0,
		weapons: WEAPONS,
		...partial,
	};
}

describe("prefillVodMatches", () => {
	test("maps validated match rows into the form's prefill shape", () => {
		const prefilled = prefillVodMatches([testMatch({ povWeapon: 20 })]);

		expect(prefilled).toHaveLength(1);
		expect(prefilled[0]).toEqual({
			startsAt: 30,
			mode: "SZ",
			stageId: 0,
			weapons: [40, 40, 40, 40, 20, 20, 20, 20],
			povWeapon: 20,
		});
	});

	test("keeps unread (null) fields for the user to fill in the form", () => {
		const prefilled = prefillVodMatches([
			testMatch({
				mode: null,
				stage: null,
				weapons: [...WEAPONS.slice(0, 7), null],
			}),
		]);

		expect(prefilled).toHaveLength(1);
		expect(prefilled[0]).toEqual({
			startsAt: 30,
			mode: null,
			stageId: null,
			weapons: [40, 40, 40, 40, 20, 20, 20, null],
			povWeapon: null,
		});
	});

	test("rejects rows that are not sendou ids", () => {
		const parsed = v.safeParse(ingestVodPrefillSchema, {
			matches: [{ ...testMatch(), stage: "Scorch Gorge" }],
		});
		expect(parsed.success).toBe(false);
	});

	test("accepts the `ingest` search param the scanner VoD tab sends", () => {
		// the { type?, matches } payload the scanner VoD tab's "Add VoD" button puts in the
		// compressed `ingest` param (~/features/scanner/components/sendou-upload.ts)
		const href = vodsNewSearchParams.href("/vods/new", {
			ingest: { type: "CAST", matches: [testMatch()] },
		});

		const { ingest } = vodsNewSearchParams.parse(
			new URL(href, "https://sendou.ink"),
		);

		expect(ingest).not.toBeNull();
		expect(ingest!.type).toBe("CAST");
		expect(prefillVodMatches(ingest!.matches)).toHaveLength(1);
	});
});
