import { ADJECTIVES, SUBTITLES_PLURALIZED } from "./team-name-data";

/** Splatoon 3 title adjective + pluralized subtitle, e.g. "Prestigious Heat Haters" */
export function randomTeamName() {
	const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
	const subtitle =
		SUBTITLES_PLURALIZED[
			Math.floor(Math.random() * SUBTITLES_PLURALIZED.length)
		];

	return `${adjective} ${subtitle}`;
}
