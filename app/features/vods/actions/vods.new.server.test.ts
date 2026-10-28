import { beforeEach, describe, expect, test } from "vitest";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { wrappedAction } from "~/utils/Test";
import type { vodFormSchemaServer } from "../vods-schemas.server";
import { action } from "./vods.new.server";

const newVodAction = wrappedAction<typeof vodFormSchemaServer>({
	action,
	isJsonSubmission: true,
});

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
}: {
	type: "TOURNAMENT" | "CAST";
	weapon?: MainWeaponId;
	teamOneCount?: number;
	teamTwoCount?: number;
}) => ({
	youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
	title: "Grand finals",
	date: { day: 1, month: 0, year: 2025 },
	type,
	teamSize: "4" as const,
	pov: type === "CAST" ? undefined : { type: "NAME" as const, name: "Sendou" },
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
			why: "cast missing a weapon",
			fields: { type: "CAST", teamOneCount: 4, teamTwoCount: 3 },
			expected: { "matches[0].weaponsTeamTwo": "forms:errors.required" },
		},
	] as const)("rejects a vod $why", async ({ fields, expected }) => {
		const response = await newVodAction(vodFields(fields), { user: "regular" });

		expect(response).toEqual({ fieldErrors: expected });
	});
});
