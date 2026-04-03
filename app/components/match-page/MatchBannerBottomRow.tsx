import type { ModeShort } from "~/modules/in-game-lists/types";
import type { CommonUser } from "~/utils/kysely.server";
import { Avatar } from "../Avatar";
import { ModeImage } from "../Image";
import styles from "./MatchBannerBottomRow.module.css";

interface MatchBannerBottomRowProps {
	games: Array<{ mode: ModeShort; winner: "ALPHA" | "BRAVO" }>;
	activeRosters: {
		alpha: CommonUser[];
		bravo: CommonUser[];
	};
}

export function MatchBannerBottomRow({
	games,
	activeRosters,
}: MatchBannerBottomRowProps) {
	return (
		<div className={styles.root}>
			<ModeProgress games={games} />
			<ActiveRosters activeRosters={activeRosters} />
		</div>
	);
}

function ModeProgress({ games }: Pick<MatchBannerBottomRowProps, "games">) {
	return (
		<div className={styles.modeProgress}>
			<div className={styles.mode}>
				<ModeImage mode="SZ" size={12} />
			</div>
			<div className={styles.mode}>
				<ModeImage mode="TC" size={12} />
			</div>
			<div className={styles.mode}>
				<ModeImage mode="RM" size={12} />
			</div>
		</div>
	);
}

function ActiveRosters({
	activeRosters,
}: Pick<MatchBannerBottomRowProps, "activeRosters">) {
	return (
		<div className={styles.activeRosters}>
			<div className={styles.team}>
				<Avatar user={{ discordAvatar: null, discordId: "asd" }} size="xxs" />
				<Avatar user={{ discordAvatar: null, discordId: "cx" }} size="xxs" />
				<Avatar user={{ discordAvatar: null, discordId: "zczxc" }} size="xxs" />
				<Avatar user={{ discordAvatar: null, discordId: "sgd" }} size="xxs" />
			</div>
			<div className={styles.vs}>vs.</div>
			<div className={styles.team}>
				<Avatar user={{ discordAvatar: null, discordId: "123" }} size="xxs" />
				<Avatar user={{ discordAvatar: null, discordId: "2345" }} size="xxs" />
				<Avatar user={{ discordAvatar: null, discordId: "2351" }} size="xxs" />
				<Avatar user={{ discordAvatar: null, discordId: "12123" }} size="xxs" />
			</div>
		</div>
	);
}
