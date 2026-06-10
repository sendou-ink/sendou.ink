import * as R from "remeda";
import type { TournamentStage } from "~/db/tables";
import type { ParsedBracket } from "../../tournament-bracket/core/Progression";

const LEADING_SEPARATOR_REGEX = /^[\s_-]+/;

/**
 * Splits a tournament name into its series name and a trailing "subtext"
 * (e.g. an edition number like `"54"` or a date like `"May 2026"`) based on the
 * names of the organization's tournament series.
 *
 * The longest series name that the tournament name starts with (case-insensitive)
 * is treated as the base name and whatever follows it becomes the subtext. If the
 * tournament name does not start with any of the series names, the whole name is
 * returned with no subtext.
 *
 * @example
 * // series: [{ name: "In The Zone" }]
 * splitTournamentName("In The Zone 54", series)     // { name: "In The Zone", subtext: "54" }
 * splitTournamentName("In The Zone Winter", series) // { name: "In The Zone", subtext: "Winter" }
 * splitTournamentName("Picnic Weekly", series)      // { name: "Picnic Weekly" }
 */
export function splitTournamentName(
	tournamentName: string,
	series: Array<{ name: string }>,
): { name: string; subtext?: string } {
	const trimmedName = tournamentName.trim();
	const nameLower = trimmedName.toLowerCase();

	const matchingSeries = R.firstBy(
		series.filter((s) => nameLower.startsWith(s.name.toLowerCase())),
		[(s) => s.name.length, "desc"],
	);

	if (!matchingSeries) return { name: trimmedName };

	const subtext = trimmedName
		.slice(matchingSeries.name.length)
		.replace(LEADING_SEPARATOR_REGEX, "")
		.trim();

	if (!subtext) return { name: matchingSeries.name };

	return { name: matchingSeries.name, subtext };
}

const STAGE_TYPE_TO_SHORT_CODE: Record<TournamentStage["type"], string> = {
	single_elimination: "SE",
	double_elimination: "DE",
	round_robin: "RR",
	swiss: "SW",
};

/**
 * Builds a compact arrow-separated label describing the bracket progression of a tournament,
 * derived from `settings.bracketProgression`.
 *
 * Each stage type is rendered as a short code (`RR`, `SE`, `DE`, `SW`) and consecutive duplicates
 * are collapsed so e.g. two single-elimination stages still render as a single `SE`.
 *
 * @example
 * // [{type: "round_robin"}, {type: "single_elimination"}]
 * bracketProgressionLabel(progression) // "RR → SE"
 */
export function bracketProgressionLabel(
	progression: Pick<ParsedBracket, "type">[],
): string {
	if (progression.length === 0) return "";

	const codes: string[] = [];
	for (const bracket of progression) {
		const code = STAGE_TYPE_TO_SHORT_CODE[bracket.type];
		if (codes.at(-1) !== code) {
			codes.push(code);
		}
	}

	return codes.join(" → ");
}
