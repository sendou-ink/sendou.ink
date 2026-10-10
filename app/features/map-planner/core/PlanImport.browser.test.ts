import { afterEach, describe, expect, test, vi } from "vitest";
import { plansSearchParams } from "../plans-search-params";
import * as PlanImport from "./PlanImport";

const BACKGROUND = new Blob([new Uint8Array([1, 2, 3])], {
	type: "image/webp",
});

async function openAndGetParams(
	stageAndMode: Pick<
		Parameters<typeof PlanImport.openInNewTab>[0],
		"stageId" | "mode"
	> = { stageId: 22, mode: "CB" },
) {
	const open = vi.spyOn(window, "open").mockReturnValue(null);
	await PlanImport.openInNewTab({
		background: BACKGROUND,
		allies: [0, 10],
		enemies: [40],
		...stageAndMode,
	});
	const url = new URL(String(open.mock.calls[0]![0]), window.location.origin);
	return plansSearchParams.parse(url);
}

async function openAndGetKey(): Promise<string> {
	return (await openAndGetParams()).import!;
}

describe("PlanImport.openInNewTab", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	test("opens the planner on the plan's stage and mode", async () => {
		const params = await openAndGetParams();

		expect([params.stage, params.mode]).toEqual([22, "CB"]);
	});

	test("leaves the planner's default stage and mode when unknown", async () => {
		const params = await openAndGetParams({ stageId: null, mode: null });

		expect([params.stage, params.mode]).toEqual([0, "SZ"]);
	});
});

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
