import { describe, expect, it } from "vitest";
import { removeDuplicates } from "../../../utils/arrays";
import invariant from "../../../utils/invariant";
import { Tournament } from "./Tournament";
import { PADDLING_POOL_255 } from "./tests/mocks";
import { LOW_INK_DECEMBER_2024 } from "./tests/mocks-li";

const TEAM_ERROR_404_ID = 17354;
const TEAM_THIS_IS_FINE_ID = 17513;

describe("swiss standings", () => {
	it("should calculate losses against tied", () => {
		const tournament = new Tournament({
			...LOW_INK_DECEMBER_2024(),
			simulateBrackets: false,
		});

		const standing = tournament
			.bracketByIdx(0)
			?.currentStandings(false)
			.find((standing) => standing.team.id === TEAM_THIS_IS_FINE_ID);

		invariant(standing, "Standing not found");

		expect(standing.stats?.lossesAgainstTied).toBe(1);
	});

	it("should ignore early dropped out teams for standings (losses against tied)", () => {
		const tournament = new Tournament({
			...LOW_INK_DECEMBER_2024(),
			simulateBrackets: false,
		});

		const standing = tournament
			.bracketByIdx(0)
			?.currentStandings(false)
			.find((standing) => standing.team.id === TEAM_ERROR_404_ID);
		invariant(standing, "Standing not found");

		expect(standing.stats?.lossesAgainstTied).toBe(0); // they lost against "Tidy Tidings" but that team dropped out before final round
	});
});

describe("round robin standings", () => {
	it("should sort teams primarily by set wins (per group) in paddling pool 255", () => {
		const tournamentPP255 = new Tournament(PADDLING_POOL_255());

		const standings = tournamentPP255.bracketByIdx(0)!.standings;

		const groupIds = removeDuplicates(
			standings.map((standing) => standing.groupId),
		);
		expect(
			groupIds.length,
			"Paddling Pool 255 should have groups from Group A to Group I",
		).toBe(9);

		for (const groupId of groupIds) {
			const groupStandings = standings.filter(
				(standing) => standing.groupId === groupId,
			);

			for (let i = 0; i < groupStandings.length; i++) {
				const current = groupStandings[i];
				const next = groupStandings[i + 1];

				if (!next) {
					break;
				}

				expect(
					current.stats!.setWins,
					`Team with ID ${current.team.id} in wrong spot relative to ${next.team.id}`,
				).toBeGreaterThanOrEqual(next.stats!.setWins);
			}
		}
	});

	it("has ascending order from lower group id to higher group id for same placements", () => {
		const tournamentPP255 = new Tournament(PADDLING_POOL_255());

		const standings = tournamentPP255.bracketByIdx(0)!.standings;

		const placements = removeDuplicates(
			standings.map((standing) => standing.placement),
		).sort((a, b) => a - b);

		for (const placement of placements) {
			const placementStandings = standings.filter(
				(standing) => standing.placement === placement,
			);

			for (let i = 0; i < placementStandings.length; i++) {
				const current = placementStandings[i];
				const next = placementStandings[i + 1];

				if (!next) {
					break;
				}

				expect(
					current.groupId,
					`Team with ID ${current.team.id} in wrong spot relative to ${next.team.id}`,
				).toBeLessThan(next.groupId!);
			}
		}
	});
});
