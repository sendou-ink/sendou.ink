import { beforeEach, describe, expect, test } from "vitest";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as VodFactory from "~/db/seed/factories/VodFactory";
import type {
	MainWeaponId,
	ModeShort,
	StageId,
} from "~/modules/in-game-lists/types";
import * as VodRepository from "./VodRepository.server";
import type { VideoBeingAdded } from "./vods-types";

const users = UserFactory.pool();

const submitterId = () => users.id(1);
const povUserId = () => users.id(2);

beforeEach(async () => {
	await users.create(3);
});

const idsOf = (rows: Array<{ id: number }>) =>
	rows.map((row) => row.id).sort((a, b) => a - b);

describe("VodRepository.vods", () => {
	describe("withMatch", () => {
		test.each([
			{
				why: "weapon, its alt skin included",
				filter: { weapon: 1010 },
				expected: ["first", "cast"],
			},
			{ why: "weapon id 0", filter: { weapon: 0 }, expected: ["scrim"] },
			{ why: "mode", filter: { mode: "SZ" }, expected: ["first", "cast"] },
			{ why: "stage", filter: { stageId: 1 }, expected: ["first", "cast"] },
			{ why: "stage id 0", filter: { stageId: 0 }, expected: ["scrim"] },
			{
				why: "weapon and mode in the same match",
				filter: { weapon: 1010, mode: "SZ" },
				expected: ["first"],
			},
			{ why: "no filter", filter: {}, expected: ["first", "cast", "scrim"] },
		] as const)("filters by $why", async ({ filter, expected }) => {
			const seeded = await seedVodsOfEveryFilter();

			const rows = await VodRepository.vods()
				.withMatch({ mode: null, stageId: null, weapon: null, ...filter })
				.execute();

			expect(idsOf(rows)).toEqual(idsOf(expected.map((name) => seeded[name])));
		});
	});

	test("withPovUser returns the vods showing the user's point of view", async () => {
		const own = await VodFactory.create({
			submitterUserId: submitterId(),
			pov: { type: "USER", userId: povUserId() },
		});
		await VodFactory.create({
			submitterUserId: povUserId(),
			pov: { type: "USER", userId: submitterId() },
		});

		const rows = await VodRepository.vods().withPovUser(povUserId()).execute();

		expect(idsOf(rows)).toEqual([own.id]);
	});

	describe("withWeapons", () => {
		const weaponsOf = async (leading: MainWeaponId | null) => {
			await VodFactory.create({
				submitterUserId: submitterId(),
				type: "CAST",
				matches: [
					{ mode: "TW", stageId: 1, startsAt: "0:00", weapons: [10, 20, 10] },
					{ mode: "SZ", stageId: 2, startsAt: "5:00", weapons: [45, 20] },
				],
			});

			const [row] = await VodRepository.vods().withWeapons(leading).execute();
			return row.weapons;
		};

		test("lists each weapon once in the order first played", async () => {
			expect(await weaponsOf(null)).toEqual([10, 20, 45]);
		});

		test("the leading weapon's alt skin comes first", async () => {
			expect(await weaponsOf(40)).toEqual([45, 10, 20]);
		});
	});

	describe("pov", () => {
		const povOf = async (
			overrides: Pick<Partial<VideoBeingAdded>, "pov" | "type">,
		) => {
			const vod = await VodFactory.create({
				submitterUserId: submitterId(),
				...overrides,
			});

			const row = await VodRepository.vods()
				.where({ id: vod.id })
				.executeTakeFirst();
			return row?.pov;
		};

		test("is the user", async () => {
			const pov = await povOf({ pov: { type: "USER", userId: povUserId() } });

			expect(typeof pov === "object" ? pov?.id : pov).toBe(povUserId());
		});

		test("is the plain name", async () => {
			expect(await povOf({ pov: { type: "NAME", name: "PlayerName" } })).toBe(
				"PlayerName",
			);
		});

		test("is null for a cast", async () => {
			expect(await povOf({ type: "CAST" })).toBeNull();
		});
	});

	test("withMatches lists matches by start time with their weapons in player order", async () => {
		const vod = await VodFactory.create({
			submitterUserId: submitterId(),
			type: "CAST",
			matches: [
				{ mode: "SZ", stageId: 2, startsAt: "5:00", weapons: [20, 10] },
				{ mode: "TW", stageId: 1, startsAt: "0:00", weapons: [30, 40, 0] },
			],
		});

		const row = await VodRepository.vodWithMatches(vod.id).executeTakeFirst();

		expect(
			row?.matches.map((match) => [match.startsAt, match.weapons]),
		).toEqual([
			[0, [30, 40, 0]],
			[300, [20, 10]],
		]);
	});

	test.each([
		{
			why: "the submitter and the pov user",
			pov: () => ({ type: "USER" as const, userId: povUserId() }),
			editors: () => [submitterId(), povUserId()],
		},
		{
			why: "only the submitter without a pov user",
			pov: () => ({ type: "NAME" as const, name: "PlayerName" }),
			editors: () => [submitterId()],
		},
	])("withEditPermissions lets $why edit", async ({ pov, editors }) => {
		const vod = await VodFactory.create({
			submitterUserId: submitterId(),
			pov: pov(),
		});

		const row = await VodRepository.vodWithMatches(vod.id).executeTakeFirst();

		expect(row?.permissions.EDIT).toEqual(editors());
	});
});

describe("VodRepository.update", () => {
	test("replaces the matches and keeps the original submitter", async () => {
		const vod = await VodFactory.create({
			submitterUserId: submitterId(),
			pov: { type: "USER", userId: povUserId() },
			matches: [
				{ mode: "TW", stageId: 0, startsAt: "0:00", weapons: [0] },
				{ mode: "SZ", stageId: 1, startsAt: "5:00", weapons: [10] },
			],
		});

		await VodRepository.update({
			id: vod.id,
			title: "Updated Title",
			youtubeUrl: "https://www.youtube.com/watch?v=updated123",
			date: { day: 1, month: 0, year: 2024 },
			matches: [{ mode: "TC", stageId: 2, startsAt: "0:05", weapons: [20] }],
			type: "TOURNAMENT",
			pov: { type: "NAME", name: "PlayerName" },
		});

		const row = await VodRepository.vodWithMatches(vod.id).executeTakeFirst();

		expect(row).toMatchObject({
			title: "Updated Title",
			youtubeId: "updated123",
			submitterUserId: submitterId(),
			pov: "PlayerName",
			matches: [{ mode: "TC", stageId: 2, startsAt: 5, weapons: [20] }],
		});
	});
});

/** Vods each matching some of the `withMatch` filters but never all of them. */
async function seedVodsOfEveryFilter() {
	const vod = (matches: Array<[ModeShort, StageId, MainWeaponId]>) =>
		VodFactory.create({
			submitterUserId: submitterId(),
			matches: matches.map(([mode, stageId, weapon], i) => ({
				mode,
				stageId,
				startsAt: `${i}:00`,
				weapons: [weapon],
			})),
		});

	return {
		first: await vod([["SZ", 1, 1010]]),
		cast: await vod([
			["SZ", 2, 2000],
			["TC", 1, 1015],
		]),
		scrim: await vod([["TC", 0, 0]]),
	};
}
