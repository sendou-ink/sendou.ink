import { useTranslation } from "react-i18next";
import type {
	BroadcastMatch,
	BroadcastView,
	ProducerState,
} from "../broadcast-types";
import { matchSides, roundLabel, scenePart } from "../broadcast-utils";
import styles from "./Matchup.module.css";
import { SetLength } from "./SetLength";
import { TeamLogo } from "./TeamLogo";

const part = scenePart("matchup");

/** The featured match in a line: both teams with the set score once it started, round and set length under. */
export function Matchup({
	match,
	view,
	producer,
}: {
	match: BroadcastMatch;
	view: BroadcastView;
	producer: Pick<ProducerState, "swapSides">;
}) {
	const { t } = useTranslation(["broadcast"]);
	const sides = matchSides(match, view, producer);
	const hasStarted = match.progress[view].resultCount > 0;

	return (
		<div className={styles.matchup} {...part("matchup")}>
			<div className={styles.teams}>
				{sides.map((side) => (
					<div
						key={side.side}
						className={styles.team}
						data-team={side.side}
						data-loser={side.isLoser || undefined}
						{...part("team")}
					>
						<TeamLogo
							team={side.team}
							className={styles.logo}
							{...part("team-logo")}
						/>
						<span className={styles.name} {...part("team-name")}>
							{side.team?.name ?? t("broadcast:overlay.tbd")}
						</span>
						{hasStarted ? (
							<span className={styles.score} {...part("team-score")}>
								{side.score}
							</span>
						) : null}
					</div>
				))}
				<span className={styles.versus}>{t("broadcast:overlay.vs")}</span>
			</div>
			<div className={styles.round} {...part("round")}>
				{roundLabel(match)}
				{roundLabel(match) ? " · " : null}
				<SetLength match={match} />
			</div>
		</div>
	);
}
