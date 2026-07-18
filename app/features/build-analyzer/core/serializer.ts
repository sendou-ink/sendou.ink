import type { BuildAbilitiesTupleWithUnknown } from "~/modules/in-game-lists/types";
import { UNKNOWN_SHORT } from "../analyzer-constants";

/**
 * Serializes a build to a comma separated string for use in URLs.
 *
 * Lives in its own module (instead of `core/utils.ts`) so that `~/utils/urls.ts`
 * can import it without pulling the weapon params data into the eager bundle.
 */
export function serializeBuild(build: BuildAbilitiesTupleWithUnknown) {
	return build
		.flat()
		.map((ability) => (ability === "UNKNOWN" ? UNKNOWN_SHORT : ability))
		.join(",");
}
