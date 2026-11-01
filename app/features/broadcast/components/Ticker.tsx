import clsx from "clsx";
import type * as React from "react";
import { useTranslation } from "react-i18next";
import type {
	BroadcastOtherMatch,
	BroadcastOtherMatchTeam,
} from "../broadcast-types";
import { scenePart } from "../broadcast-utils";
import styles from "./Ticker.module.css";

const part = scenePart("ticker");

/** "Elsewhere": the tournament's other matches scrolling by with their seeds and set scores. Nothing without other matches. */
export function Ticker({
	matches,
	className,
}: {
	matches: BroadcastOtherMatch[];
	className?: string;
}) {
	const { t } = useTranslation(["broadcast"]);

	if (matches.length === 0) return null;

	return (
		<div
			className={clsx(styles.ticker, className)}
			style={{ "--ticker-matches": matches.length } as React.CSSProperties}
			{...part("ticker")}
		>
			<div className={styles.label} {...part("ticker-label")}>
				{t("broadcast:overlay.elsewhere")}
			</div>
			<div className={styles.viewport}>
				<div className={styles.track}>
					{/* twice in a row, scrolling by one copy loops seamlessly */}
					{[false, true].map((isCopy) => (
						<div
							key={String(isCopy)}
							className={styles.matches}
							aria-hidden={isCopy || undefined}
						>
							{matches.map((match) => (
								<TickerMatch key={match.id} match={match} />
							))}
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

function TickerMatch({ match }: { match: BroadcastOtherMatch }) {
	const standing = (index: 0 | 1) => ({
		"data-winner": match.winner === index || undefined,
		"data-loser":
			(match.winner !== null && match.winner !== index) || undefined,
	});

	return (
		<div
			className={styles.match}
			data-status={match.winner === null ? "live" : "over"}
			{...part("ticker-match")}
		>
			{match.roundName ? (
				<span className={styles.round} {...part("ticker-round")}>
					{match.roundName}
				</span>
			) : null}
			<TickerTeam team={match.teams[0]} {...standing(0)} />
			<span className={styles.scores}>
				{([0, 1] as const).map((index) => (
					<span
						key={index}
						className={styles.score}
						{...standing(index)}
						{...part("ticker-team-score")}
					>
						{match.scores[index]}
					</span>
				))}
			</span>
			<TickerTeam team={match.teams[1]} {...standing(1)} />
		</div>
	);
}

function TickerTeam({
	team,
	...standing
}: {
	team: BroadcastOtherMatchTeam | null;
	"data-winner"?: true;
	"data-loser"?: true;
}) {
	const { t } = useTranslation(["broadcast"]);

	return (
		<span className={styles.team} {...standing} {...part("ticker-team")}>
			{typeof team?.seed === "number" ? (
				<span className={styles.seed} {...part("ticker-team-seed")}>
					{team.seed}
				</span>
			) : null}
			<span className={styles.name} {...part("ticker-team-name")}>
				{team?.name ?? t("broadcast:overlay.tbd")}
			</span>
		</span>
	);
}
