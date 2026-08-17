/**
 * Shapes of JSON column payloads (and small column unions) shared by the
 * server-only `DB` schema and client-facing types. Kept outside `src/lib/server`
 * so client code can import the types without touching server modules.
 */

import type { ScrimFilters } from "#lib/features/scrims/scrims-types.ts";

export type XRankPlacementRegion = "WEST" | "JPN";

export interface UserPreferences {
	disableBuildAbilitySorting?: boolean;
	disallowScrimPickupsFromUntrusted?: boolean;
	defaultScrimsFilters?: ScrimFilters;
	/**
	 * What time format the user prefers?
	 *
	 * "auto" = use browser default (default value)
	 * "24h" = 24 hour format (e.g. 14:00)
	 * "12h" = 12 hour format (e.g. 2:00 PM)
	 * */
	clockFormat?: "24h" | "12h" | "auto";
	/** Is the new widget based user page enabled? (Supporter early preview) */
	newProfileEnabled?: boolean;
	/** Is spoiler-free mode enabled? Hides recent tournament results and scores until the user chooses to reveal them. */
	spoilerFreeMode?: boolean;
	weaponReportDefaultOpen?: boolean;
}

export interface PeakXP {
	/** Peak XP across all divisions */
	overall: number;
	/** Peak XP (Takoroka division) */
	takoroka: number | null;
	/** Peak XP (Tentatek division) */
	tentatek: number | null;
}

export type SubjectPronoun = "he" | "she" | "they" | "it" | "any";

export type ObjectPronoun =
	| "him"
	| "her"
	| "them"
	| "its"
	| "all"
	| SubjectPronoun;

export type Pronouns = {
	subject: SubjectPronoun;
	object: ObjectPronoun;
};
