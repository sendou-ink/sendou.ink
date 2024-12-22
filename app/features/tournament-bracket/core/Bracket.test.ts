import { describe, expect, it } from "vitest";
import invariant from "../../../utils/invariant";
import { Tournament } from "./Tournament";
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
