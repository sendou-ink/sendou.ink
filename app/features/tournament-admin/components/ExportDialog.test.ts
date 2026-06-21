import { describe, expect, it } from "vitest";
import type { TournamentDataTeam } from "~/features/tournament-bracket/core/Tournament.server";
import { scopedAndSortedTeams } from "./ExportDialog";

function team(
	id: number,
	checkIns: TournamentDataTeam["checkIns"],
): TournamentDataTeam {
	return {
		id,
		name: `Team ${id}`,
		seed: id,
		createdAt: id,
		checkIns,
	} as unknown as TournamentDataTeam;
}

function checkIns(
	rows: Array<{ bracketIdx: number | null; isCheckOut?: number }>,
): TournamentDataTeam["checkIns"] {
	return rows.map((row, i) => ({
		bracketIdx: row.bracketIdx,
		checkedInAt: i + 1,
		isCheckOut: row.isCheckOut ?? 0,
	})) as unknown as TournamentDataTeam["checkIns"];
}

// Event-level check-in is stored with bracketIdx === null (see CHECK_IN action:
// `bracketIdx: bracket.sources ? data.bracketIdx : undefined`). A team checked in
// to the tournament therefore has a single null-bracket, non-checkout row.
const checkedInAtEventLevel = team(1, checkIns([{ bracketIdx: null }]));

describe("scopedAndSortedTeams() check-in filtering", () => {
	// A bracket without its own check-in (the starting bracket / any bracket where
	// requiresCheckIn is false) is exported against the event-level check-in. This is
	// the user-reported case: selecting such a bracket previously matched bracketIdx
	// against the (null) event rows, so "Checked in" was empty and "Not checked in"
	// listed the teams that were actually checked in.
	describe("bracket without its own check-in", () => {
		const bracketParticipantIds = new Set([checkedInAtEventLevel.id]);

		it("includes an event-level checked-in team in 'Checked in only'", () => {
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

		it("excludes an event-level checked-in team from 'Not checked in'", () => {
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

	// A bracket with its own check-in (requiresCheckIn) is exported against its own
	// per-bracket rows, so an event-level check-in alone is not enough.
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

		it("keeps only the team checked into the bracket in 'Checked in only'", () => {
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

		it("lists a bracket team pending check-in in 'Not checked in'", () => {
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

		it("excludes a not-checked-in team that does not participate in the bracket", () => {
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
