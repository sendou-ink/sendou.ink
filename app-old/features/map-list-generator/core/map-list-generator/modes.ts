import shuffle from "just-shuffle";
import type { ModeShort } from "../../../../modules/in-game-lists";

export function modesOrder(
	type: "EQUAL" | "SZ_EVERY_OTHER",
	modes: ModeShort[],
): ModeShort[] {
	if (type === "EQUAL") {
		return shuffle(modes);
	}

	const withoutSZ = shuffle(modes.filter((mode) => mode !== "SZ"));

	return withoutSZ.flatMap((mode) => [mode, "SZ"]);
}
