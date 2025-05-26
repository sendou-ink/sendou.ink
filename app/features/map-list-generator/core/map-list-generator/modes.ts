import * as R from "remeda";
import type { ModeShort } from "../../../../modules/in-game-lists/types";

export function modesOrder(
	type: "EQUAL" | "SZ_EVERY_OTHER",
	modes: ModeShort[],
): ModeShort[] {
	if (type === "EQUAL") {
		return R.shuffle(modes);
	}

	const withoutSZ = R.shuffle(modes.filter((mode) => mode !== "SZ"));

	return withoutSZ.flatMap((mode) => [mode, "SZ"]);
}
