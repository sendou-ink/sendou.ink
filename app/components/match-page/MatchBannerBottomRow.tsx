import type { ModeShort } from "~/modules/in-game-lists/types";
import type { CommonUser } from "~/utils/kysely.server";
import styles from "./MatchBannerBottomRow.module.css";

export function MatchBannerBottomRow({
	games,
	activeRosters,
}: {
	games: Array<{ mode: ModeShort; winner: "ALPHA" | "BRAVO" }>;
	activeRosters: {
		alpha: CommonUser[];
		bravo: CommonUser[];
	};
}) {
	return <div className={styles.root} />;
}
