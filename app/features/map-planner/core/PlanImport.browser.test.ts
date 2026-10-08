import { afterEach, describe, expect, test, vi } from "vitest";
import { plansSearchParams } from "../plans-search-params";
import * as PlanImport from "./PlanImport";

const BACKGROUND = new Blob([new Uint8Array([1, 2, 3])], {
	type: "image/webp",
});

async function openAndGetKey(): Promise<string> {
	const open = vi.spyOn(window, "open").mockReturnValue(null);
	await PlanImport.openInNewTab({
		background: BACKGROUND,
		allies: [0, 10],
		enemies: [40],
	});
	const url = new URL(String(open.mock.calls[0]![0]), window.location.origin);
	return plansSearchParams.parse(url).import!;
}

describe("PlanImport.claim", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	test("receives the plan opened in the new tab", async () => {
		const plan = PlanImport.claim(await openAndGetKey());

		expect(plan).toEqual({
			background: "data:image/webp;base64,AQID",
			allies: [0, 10],
			enemies: [40],
		});
	});

	test("removes the stashed plan once claimed", async () => {
		const key = await openAndGetKey();
		PlanImport.claim(key);

		expect(
			Object.keys(localStorage).filter((storageKey) =>
				storageKey.includes(key),
			),
		).toEqual([]);
	});

	test("claiming the same key again gets the same plan", async () => {
		const key = await openAndGetKey();
		const first = PlanImport.claim(key);

		expect(PlanImport.claim(key)).toBe(first);
	});

	test("returns null for a key nothing was stashed under", () => {
		expect(PlanImport.claim("1759900000000-none00")).toBeNull();
	});
});
