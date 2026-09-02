import { describe, expect, test } from "vitest";
import type { TournamentTeamFull } from "~/features/tournament-bracket/core/Tournament.server";
import { scopedAndSortedTeams } from "./ExportDialog";

function team(
	id: number,
	checkIns: TournamentTeamFull["checkIns"],
): TournamentTeamFull {
	return {
		id,
		name: `Team ${id}`,
		seed: id,
		createdAt: id,
		checkIns,
	} as unknown as TournamentTeamFull;
}

function checkIns(
	rows: Array<{ bracketIdx: number | null; isCheckOut?: number }>,
): TournamentTeamFull["checkIns"] {
	return rows.map((row, i) => ({
		bracketIdx: row.bracketIdx,
		checkedInAt: i + 1,
		isCheckOut: row.isCheckOut ?? 0,
	})) as unknown as TournamentTeamFull["checkIns"];
}

// event-level check-in is stored with bracketIdx === null, so a team checked in to the
// tournament has a single null-bracket, non-checkout row
const checkedInAtEventLevel = team(1, checkIns([{ bracketIdx: null }]));

describe("scopedAndSortedTeams() check-in filtering", () => {
	// a bracket without its own check-in (starting bracket / requiresCheckIn false) is exported
	// against the event-level check-in; regression: matching bracketIdx against the null event
	// rows emptied "Checked in" and listed the checked in teams under "Not checked in"
	describe("bracket without its own check-in", () => {
		const bracketParticipantIds = new Set([checkedInAtEventLevel.id]);

		test("includes an event-level checked-in team in 'Checked in only'", () => {
			const result = scopedAndSortedTeams({
				teams: [checkedInAtEventLevel],
				status: "checkedIn",
				sort: "seed",
				bracketIdx: 0,
				bracketRequiresOwnCheckIn: false,
				bracketParticipantIds,
			});

			expect(result.map((t) => t.id)).toEqual([checkedInAtEventLevel.id]);
		});

		test("excludes an event-level checked-in team from 'Not checked in'", () => {
			const result = scopedAndSortedTeams({
				teams: [checkedInAtEventLevel],
				status: "notCheckedIn",
				sort: "seed",
				bracketIdx: 0,
				bracketRequiresOwnCheckIn: false,
				bracketParticipantIds,
			});

			expect(result.map((t) => t.id)).toEqual([]);
		});
	});

	// a bracket with its own check-in is exported against its per-bracket rows, event-level alone is not enough
	describe("bracket with its own check-in", () => {
		const checkedIntoBracket = team(
			1,
			checkIns([{ bracketIdx: null }, { bracketIdx: 2 }]),
		);
		const onlyEventLevel = team(2, checkIns([{ bracketIdx: null }]));
		const bracketParticipantIds = new Set([
			checkedIntoBracket.id,
			onlyEventLevel.id,
		]);

		test("keeps only the team checked into the bracket in 'Checked in only'", () => {
			const result = scopedAndSortedTeams({
				teams: [checkedIntoBracket, onlyEventLevel],
				status: "checkedIn",
				sort: "seed",
				bracketIdx: 2,
				bracketRequiresOwnCheckIn: true,
				bracketParticipantIds,
			});

			expect(result.map((t) => t.id)).toEqual([checkedIntoBracket.id]);
		});

		test("lists a bracket team pending check-in in 'Not checked in'", () => {
			const result = scopedAndSortedTeams({
				teams: [checkedIntoBracket, onlyEventLevel],
				status: "notCheckedIn",
				sort: "seed",
				bracketIdx: 2,
				bracketRequiresOwnCheckIn: true,
				bracketParticipantIds,
			});

			expect(result.map((t) => t.id)).toEqual([onlyEventLevel.id]);
		});

		test("excludes a not-checked-in team that does not participate in the bracket", () => {
			const notInBracket = team(3, checkIns([]));

			const result = scopedAndSortedTeams({
				teams: [checkedIntoBracket, onlyEventLevel, notInBracket],
				status: "notCheckedIn",
				sort: "seed",
				bracketIdx: 2,
				bracketRequiresOwnCheckIn: true,
				// notInBracket is intentionally absent from the bracket's pool
				bracketParticipantIds,
			});

			expect(result.map((t) => t.id)).toEqual([onlyEventLevel.id]);
		});
	});
});
