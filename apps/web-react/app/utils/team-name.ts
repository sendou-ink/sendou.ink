import { ADJECTIVES, SUBTITLES_PLURALIZED } from "./team-name-data";

/** Generates a random team name by combining a Splatoon 3 title adjective with a pluralized subtitle e.g. "Prestigious Heat Haters" */
export function randomTeamName() {
	const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
	const subtitle =
		SUBTITLES_PLURALIZED[
			Math.floor(Math.random() * SUBTITLES_PLURALIZED.length)
		];

	return `${adjective} ${subtitle}`;
}
