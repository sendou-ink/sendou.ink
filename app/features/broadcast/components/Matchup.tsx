import { useTranslation } from "react-i18next";
import type {
	BroadcastMatch,
	BroadcastView,
	ProducerState,
} from "../broadcast-types";
import {
	combineStyles,
	matchSides,
	roundLabel,
	scenePart,
} from "../broadcast-utils";
import layout from "./Matchup.layout.module.css";
import look from "./Matchup.module.css";
import { SetLength } from "./SetLength";
import { TeamLogo } from "./TeamLogo";

const styles = combineStyles(look, layout);

const part = scenePart("matchup");

/** The featured match in a line: both teams with their seeds and the set score once it started (unless `showsScore` is off), round and set length under. */
export function Matchup({
	match,
	view,
	producer,
	showsScore = true,
}: {
	match: BroadcastMatch;
	view: BroadcastView;
	producer: Pick<ProducerState, "swapSides">;
	showsScore?: boolean;
}) {
	const { t } = useTranslation(["broadcast"]);
	const sides = matchSides(match, view, producer);
	const hasStarted = showsScore && match.progress[view].resultCount > 0;

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
						<div className={styles.title}>
							<span className={styles.name} {...part("team-name")}>
								{side.team?.name ?? t("broadcast:overlay.tbd")}
							</span>
							{side.team?.seed ? (
								<span className={styles.seed} {...part("team-seed")}>
									{t("broadcast:overlay.seed", { seed: side.team.seed })}
								</span>
							) : null}
						</div>
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
