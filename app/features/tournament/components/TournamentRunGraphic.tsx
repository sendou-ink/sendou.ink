import clsx from "clsx";
import { ArrowDown } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import * as R from "remeda";
import { tournamentTeamPage } from "~/utils/urls";
import {
	GraphicContainer,
	GraphicFooter,
	GraphicHeader,
	GraphicPlacementCell,
	GraphicSiteUrl,
	type GraphicTeam,
	GraphicTeamRow,
	GraphicTeamsList,
	type TournamentResultsGraphicTeam,
} from "./TournamentResultsGraphic";
import styles from "./TournamentRunGraphic.module.css";

export interface TournamentRunGraphicMatch {
	opponent: GraphicTeam;
	ownScore: number;
	opponentScore: number;
	roundName: string;
	bracketName: string;
}

export function TournamentRunGraphic({
	tournamentId,
	tournamentTeamId,
	tournamentName,
	startTime,
	logoUrl,
	tier,
	organization,
	team,
	seed,
	matches,
	teamsCount,
	playersCount,
}: {
	tournamentId: number;
	tournamentTeamId: number;
	tournamentName: string;
	startTime: Date;
	logoUrl?: string;
	tier?: number;
	organization?: { name: string; avatarUrl?: string };
	team: TournamentResultsGraphicTeam;
	seed?: number;
	matches: TournamentRunGraphicMatch[];
	teamsCount: number;
	playersCount: number;
}) {
	const { t } = useTranslation(["calendar", "tournament"]);

	const setsWon = matches.filter(
		(match) => match.ownScore > match.opponentScore,
	).length;
	const setsLost = matches.length - setsWon;
	const mapsWon = R.sumBy(matches, (match) => match.ownScore);
	const mapsLost = R.sumBy(matches, (match) => match.opponentScore);

	return (
		<GraphicContainer>
			<GraphicHeader
				tournamentName={tournamentName}
				startTime={startTime}
				logoUrl={logoUrl}
				tier={tier}
				organization={organization}
			/>
			<GraphicTeamRow as="div" team={team} className={styles.ownTeamRow} />
			<div className={styles.statsRow}>
				<Stat label={t("tournament:team.placement")}>
					<GraphicPlacementCell placement={team.placement} />
				</Stat>
				{typeof seed === "number" ? (
					<Stat label={t("tournament:team.seed")}>{seed}</Stat>
				) : null}
				<Stat label={t("tournament:run.sets")}>
					<WonLost won={setsWon} lost={setsLost} />
				</Stat>
				<Stat label={t("tournament:run.maps")}>
					<WonLost won={mapsWon} lost={mapsLost} />
				</Stat>
			</div>
			<GraphicTeamsList>
				{matches.map((match, index) => {
					const previousMatch = matches[index - 1];
					const qualifiedForBracket =
						previousMatch && previousMatch.bracketName !== match.bracketName;

					return (
						<React.Fragment key={`${index}-${match.opponent.name}`}>
							{qualifiedForBracket ? (
								<li className={styles.bracketDivider}>
									<ArrowDown size={14} />
									{t("tournament:run.qualifiedFor", {
										bracket: match.bracketName,
									})}
								</li>
							) : null}
							<GraphicTeamRow
								className={styles.matchRow}
								team={match.opponent}
								leading={
									<div className={styles.matchLeading}>
										<div className={styles.roundName}>{match.roundName}</div>
										<ScoreCell
											ownScore={match.ownScore}
											opponentScore={match.opponentScore}
										/>
									</div>
								}
							/>
						</React.Fragment>
					);
				})}
			</GraphicTeamsList>
			<GraphicFooter>
				<div>
					{t("calendar:count.teams", { count: teamsCount })} ·{" "}
					{t("calendar:count.players", { count: playersCount })}
				</div>
				<GraphicSiteUrl
					path={tournamentTeamPage({ tournamentId, tournamentTeamId })}
				/>
			</GraphicFooter>
		</GraphicContainer>
	);
}

function Stat({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className={styles.stat}>
			<div className={styles.statLabel}>{label}</div>
			<div className={styles.statValue}>{children}</div>
		</div>
	);
}

function WonLost({ won, lost }: { won: number; lost: number }) {
	return (
		<>
			<span className={styles.statWin}>{won}</span>
			<span className={styles.statSeparator}>-</span>
			<span className={styles.statLoss}>{lost}</span>
		</>
	);
}

function ScoreCell({
	ownScore,
	opponentScore,
}: {
	ownScore: number;
	opponentScore: number;
}) {
	return (
		<div
			className={clsx(
				styles.score,
				ownScore > opponentScore ? styles.scoreWin : styles.scoreLoss,
			)}
		>
			{ownScore}-{opponentScore}
		</div>
	);
}
