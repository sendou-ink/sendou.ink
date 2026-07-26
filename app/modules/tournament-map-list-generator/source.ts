import invariant from "~/utils/invariant";
import { sourceTypes } from "./constants";
import type {
	DBTournamentMaplistSource,
	TournamentMaplistSource,
} from "./types";

/** Converts a map's source into the form stored in the `source` columns of the database. */
export function serializeMaplistSource(
	source: TournamentMaplistSource,
): DBTournamentMaplistSource {
	return typeof source === "number" ? String(source) : source;
}

/** Converts a `source` column value back into a map's source, resolving team ids back to numbers. */
export function parseMaplistSource(
	source: DBTournamentMaplistSource,
): TournamentMaplistSource {
	if (sourceTypes.includes(source as (typeof sourceTypes)[number])) {
		return source as (typeof sourceTypes)[number];
	}

	const teamId = Number(source);

	invariant(!Number.isNaN(teamId), `Invalid source: ${source}`);

	return teamId;
}
