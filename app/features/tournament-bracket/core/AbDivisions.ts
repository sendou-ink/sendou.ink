import { err, ok, type Result } from "~/utils/result";

interface ValidateArgs {
	abDivisionsBySeedOrder: (number | null | undefined)[];
	groupCount: number;
}

/**
 * Division assignments parallel to the seeding for an A/B round robin, or an error message for the
 * organizer: every team needs an A (0) or B (1) assignment, counts may differ by at most 1 (and then
 * only one group is allowed), equal counts must split evenly into groups of even size.
 */
export function validate({
	abDivisionsBySeedOrder,
	groupCount,
}: ValidateArgs): Result<(0 | 1)[], string> {
	const teamCount = abDivisionsBySeedOrder.length;

	const missingAssignment = abDivisionsBySeedOrder.some(
		(division) => division !== 0 && division !== 1,
	);
	if (missingAssignment) {
		return err(
			"Every checked-in team must be assigned to A or B before starting the bracket",
		);
	}

	const aCount = abDivisionsBySeedOrder.filter(
		(division) => division === 0,
	).length;
	const bCount = abDivisionsBySeedOrder.filter(
		(division) => division === 1,
	).length;
	const diff = Math.abs(aCount - bCount);

	if (diff > 1) {
		return err(
			`Unbalanced A/B divisions (${aCount} A, ${bCount} B) — counts can differ by at most 1`,
		);
	}

	if (diff === 1) {
		if (groupCount !== 1) {
			return err(
				`Uneven A/B divisions (${aCount} A, ${bCount} B) are only supported with a single group`,
			);
		}

		return ok(abDivisionsBySeedOrder as (0 | 1)[]);
	}

	if (teamCount % groupCount !== 0) {
		return err(
			`Can't evenly distribute ${teamCount} checked-in teams into ${groupCount} groups`,
		);
	}

	const teamsPerGroup = teamCount / groupCount;
	if (teamsPerGroup % 2 !== 0) {
		return err(
			`Each group would have ${teamsPerGroup} teams — must be even for A/B divisions`,
		);
	}

	return ok(abDivisionsBySeedOrder as (0 | 1)[]);
}

/** Counts checked-in teams by division. Unassigned teams are excluded. */
export function countByDivision(teams: { abDivision: number | null }[]) {
	const a = teams.filter((team) => team.abDivision === 0).length;
	const b = teams.filter((team) => team.abDivision === 1).length;
	const unassigned = teams.filter(
		(team) => team.abDivision !== 0 && team.abDivision !== 1,
	).length;

	return { a, b, unassigned };
}
