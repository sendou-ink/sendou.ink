import { describe, expect, it } from "vitest";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import * as IngestedNames from "./IngestedNames";

const TEAM_A = 100;
const TEAM_B = 200;

function row({
	name,
	teamId = TEAM_A,
	mapIndex = 0,
	weaponSplId = 10 as MainWeaponId,
}: {
	name: string;
	teamId?: number | null;
	mapIndex?: number;
	weaponSplId?: MainWeaponId;
}) {
	return {
		ingestedInGameName: name,
		ingestedTeamId: teamId,
		mapIndex,
		weaponSplId,
	};
}

describe("unlinkedNameGroups", () => {
	it("merges near-identical names that never appear in the same map", () => {
		const groups = IngestedNames.unlinkedNameGroups([
			row({ name: "Jrod_14", mapIndex: 0 }),
			row({ name: "Jrodl4", mapIndex: 1, weaponSplId: 20 as MainWeaponId }),
			row({ name: "Jrod_14", mapIndex: 2 }),
		]);

		expect(groups).toHaveLength(1);
		expect(groups[0]!.primaryName).toBe("Jrod_14");
		expect(groups[0]!.names.sort()).toEqual(["Jrod_14", "Jrodl4"]);
		expect(groups[0]!.weapons).toEqual([10, 20]);
		expect(groups[0]!.mapIndexes).toEqual([0, 1, 2]);
	});

	it("chains variants transitively", () => {
		const groups = IngestedNames.unlinkedNameGroups([
			row({ name: "くらうlに ★^", mapIndex: 0 }),
			row({ name: "<らうrに ★¬", mapIndex: 1 }),
			row({ name: "<らうιに ★¬", mapIndex: 2 }),
			row({ name: "くらうιに ★¬", mapIndex: 3 }),
			row({ name: "くらうlに ★^", mapIndex: 4 }),
		]);

		expect(groups).toHaveLength(1);
		expect(groups[0]!.primaryName).toBe("くらうlに ★^");
		expect(groups[0]!.names).toHaveLength(4);
	});

	it("does not merge similar names that appear in the same map", () => {
		const groups = IngestedNames.unlinkedNameGroups([
			row({ name: "Sami", mapIndex: 0 }),
			row({ name: "Samu", mapIndex: 0 }),
		]);

		expect(groups).toHaveLength(2);
	});

	it("leaves the whole cluster unmerged when a transitive merge is contradicted by a shared map", () => {
		const groups = IngestedNames.unlinkedNameGroups([
			row({ name: "player1", mapIndex: 0 }),
			row({ name: "playerl", mapIndex: 0 }),
			row({ name: "playerI", mapIndex: 1 }),
		]);

		expect(groups).toHaveLength(3);
	});

	it("does not merge dissimilar names", () => {
		const groups = IngestedNames.unlinkedNameGroups([
			row({ name: "Bocchi", mapIndex: 0 }),
			row({ name: "have faith", mapIndex: 1 }),
		]);

		expect(groups).toHaveLength(2);
	});

	it("is stricter with short names", () => {
		const groups = IngestedNames.unlinkedNameGroups([
			row({ name: "Eli", mapIndex: 0 }),
			row({ name: "Ala", mapIndex: 1 }),
		]);

		expect(groups).toHaveLength(2);
	});

	it("does not merge across teams", () => {
		const groups = IngestedNames.unlinkedNameGroups([
			row({ name: "Jrod_14", teamId: TEAM_A, mapIndex: 0 }),
			row({ name: "Jrodl4", teamId: TEAM_B, mapIndex: 1 }),
		]);

		expect(groups).toHaveLength(2);
	});
});

describe("preselectedUserIdByGroup", () => {
	function player({
		id,
		teamId = TEAM_A,
		inGameName = null,
	}: {
		id: number;
		teamId?: number;
		inGameName?: string | null;
	}) {
		return { id, tournamentTeamId: teamId, inGameName };
	}

	function groupsOf(rows: Parameters<typeof row>[0][]) {
		return IngestedNames.unlinkedNameGroups(rows.map(row));
	}

	it("preselects on an exact in-game name match", () => {
		const groups = groupsOf([{ name: "Nayo" }]);
		const result = IngestedNames.preselectedUserIdByGroup({
			groups,
			players: [player({ id: 1, inGameName: "nayo#1234" })],
		});

		expect(result[IngestedNames.groupKey(groups[0]!)]).toBe(1);
	});

	it("preselects on an unambiguous fuzzy match", () => {
		const groups = groupsOf([{ name: "Jrodl4" }]);
		const result = IngestedNames.preselectedUserIdByGroup({
			groups,
			players: [
				player({ id: 1, inGameName: "Jrod_14#3336" }),
				player({ id: 2, inGameName: "Tenshi#1233" }),
			],
		});

		expect(result[IngestedNames.groupKey(groups[0]!)]).toBe(1);
	});

	it("does not preselect when a group fuzzy-matches several players", () => {
		const groups = groupsOf([{ name: "player1" }]);
		const result = IngestedNames.preselectedUserIdByGroup({
			groups,
			players: [
				player({ id: 1, inGameName: "playerI" }),
				player({ id: 2, inGameName: "player7" }),
			],
		});

		expect(result).toEqual({});
	});

	it("does not preselect when several groups fuzzy-match the same player", () => {
		const groups = groupsOf([
			{ name: "Samii", mapIndex: 0 },
			{ name: "Samio", mapIndex: 0 },
		]);
		const result = IngestedNames.preselectedUserIdByGroup({
			groups,
			players: [player({ id: 1, inGameName: "Samir" })],
		});

		expect(result).toEqual({});
	});

	it("keeps an exact match even when another group fuzzy-matches the same player", () => {
		const groups = groupsOf([
			{ name: "Samir", mapIndex: 0 },
			{ name: "Samio", mapIndex: 0 },
		]);
		const result = IngestedNames.preselectedUserIdByGroup({
			groups,
			players: [player({ id: 1, inGameName: "Samir" })],
		});

		const exactGroup = groups.find((g) => g.primaryName === "Samir")!;
		const fuzzyGroup = groups.find((g) => g.primaryName === "Samio")!;
		expect(result[IngestedNames.groupKey(exactGroup)]).toBe(1);
		expect(result[IngestedNames.groupKey(fuzzyGroup)]).toBeUndefined();
	});

	it("only considers players of the group's team", () => {
		const groups = groupsOf([{ name: "Nayo", teamId: TEAM_A }]);
		const result = IngestedNames.preselectedUserIdByGroup({
			groups,
			players: [player({ id: 1, teamId: TEAM_B, inGameName: "Nayo#1234" })],
		});

		expect(result).toEqual({});
	});

	it("considers all players when the group's team is unknown", () => {
		const groups = groupsOf([{ name: "Nayo", teamId: null }]);
		const result = IngestedNames.preselectedUserIdByGroup({
			groups,
			players: [player({ id: 1, teamId: TEAM_B, inGameName: "Nayo#1234" })],
		});

		expect(result[IngestedNames.groupKey(groups[0]!)]).toBe(1);
	});
});
