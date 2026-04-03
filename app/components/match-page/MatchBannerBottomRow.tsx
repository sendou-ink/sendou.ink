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
			{games.map((game, i) => (
				<div key={i} className={styles.mode}>
					<ModeImage mode={game.mode} size={12} />
				</div>
			))}
		</div>
	);
}

function Roster({ users }: { users: CommonUser[] }) {
	return (
		<div className={styles.team}>
			{users.map((user) => (
				<Avatar key={user.id} user={user} size="xxs" />
			))}
		</div>
	);
}

function ActiveRosters({
	activeRosters,
}: Pick<MatchBannerBottomRowProps, "activeRosters">) {
	return (
		<div className={styles.activeRosters}>
			<Roster users={activeRosters.alpha} />
			<div className={styles.vs}>vs.</div>
			<Roster users={activeRosters.bravo} />
		</div>
	);
}
