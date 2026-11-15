import { beforeEach, describe, expect, test } from "vitest";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { wrappedAction } from "~/utils/Test";
import * as VodRepository from "../VodRepository.server";
import type { vodFormSchemaServer } from "../vods-schemas.server";
import { action } from "./vods.new.server";

const newVodAction = wrappedAction<typeof vodFormSchemaServer>({
	action,
	isJsonSubmission: true,
});

const users = UserFactory.pool();
const povUserId = () => users.id(1);

const weaponPoolOf = (count: number) =>
	Array.from({ length: count }, () => ({
		id: 1000 as MainWeaponId,
		isFavorite: false,
	}));

const vodFields = ({
	type,
	weapon,
	teamOneCount = 0,
	teamTwoCount = 0,
	pov = type === "CAST" ? undefined : { type: "NAME", name: "Sendou" },
}: {
	type: "TOURNAMENT" | "CAST";
	weapon?: MainWeaponId;
	teamOneCount?: number;
	teamTwoCount?: number;
	pov?: { type: "USER"; userId?: number } | { type: "NAME"; name: string };
}) => ({
	youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
	title: "Grand finals",
	date: { day: 1, month: 0, year: 2025 },
	type,
	teamSize: "4" as const,
	pov,
	matches: [
		{
			startsAt: "0:00",
			mode: "SZ" as const,
			stageId: 1 as const,
			weapon,
			weaponsTeamOne: weaponPoolOf(teamOneCount),
			weaponsTeamTwo: weaponPoolOf(teamTwoCount),
		},
	],
});

describe("new vod action", () => {
	beforeEach(async () => {
		await UserFactory.createRegular(null, { roles: ["VIDEO_ADDER"] });
		await users.create(1);
	});

	test.each([
		{
			why: "with the POV player's weapon",
			fields: { type: "TOURNAMENT", weapon: 1000 },
		},
		{
			why: "cast with full teams",
			fields: { type: "CAST", teamOneCount: 4, teamTwoCount: 4 },
		},
	] as const)("saves a vod $why", async ({ fields }) => {
		const response = await newVodAction(vodFields(fields), { user: "regular" });

		expect(response.headers.get("Location")).toMatch(/^\/vods\/\d+$/);
	});

	test.each([
		{
			why: "without the POV player's weapon",
			fields: { type: "TOURNAMENT" },
			expected: { "matches[0].weapon": "forms:errors.required" },
		},
		{
			why: "whose POV player was never picked",
			fields: { type: "TOURNAMENT", weapon: 1000, pov: { type: "USER" } },
			expected: { pov: "forms:errors.required" },
		},
		{
			why: "cast missing a weapon",
			fields: { type: "CAST", teamOneCount: 4, teamTwoCount: 3 },
			expected: { "matches[0].weaponsTeamTwo": "forms:errors.required" },
		},
	] as const)("rejects a vod $why", async ({ fields, expected }) => {
		const response = await newVodAction(vodFields(fields), { user: "regular" });

		expect(response).toEqual({ fieldErrors: expected });
	});

	// the POV field is hidden for a cast but keeps the value picked before switching the type
	test("drops a POV picked before switching the type to cast", async () => {
		const response = await newVodAction(
			vodFields({
				type: "CAST",
				teamOneCount: 4,
				teamTwoCount: 4,
				pov: { type: "USER", userId: povUserId() },
			}),
			{ user: "regular" },
		);
		const vodId = Number(response.headers.get("Location")!.split("/").at(-1));

		const vod = await VodRepository.findVodById(vodId);

		expect(vod!.pov).toBeUndefined();
		expect(await VodRepository.findByUserId(povUserId())).toEqual([]);
	});
});
