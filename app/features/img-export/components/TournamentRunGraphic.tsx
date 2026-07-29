import clsx from "clsx";
import { ArrowDown } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import * as R from "remeda";
import { LocaleTime } from "~/components/LocaleTime";
import { tournamentTeamPage } from "~/utils/urls";
import {
	GraphicContainer,
	GraphicPlacementCell,
	GraphicScore,
	GraphicSectionDivider,
	GraphicStat,
	GraphicStatsRow,
	type GraphicTeam,
	GraphicTeamRow,
	GraphicTeamsList,
	GraphicWonLost,
} from "./Graphic";
import graphicStyles from "./Graphic.module.css";
import {
	TournamentGraphicFooter,
	TournamentGraphicHeader,
	type TournamentResultsGraphicTeam,
} from "./TournamentResultsGraphic";
import styles from "./TournamentRunGraphic.module.css";

const SERIES_WIN_DATE_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
	day: "numeric",
	month: "short",
	year: "numeric",
};

export interface TournamentRunGraphicSeriesWin {
	name: string;
	startTime: Date;
}

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
	seriesWins,
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
	seriesWins?: {
		totalCount: number;
		first: TournamentRunGraphicSeriesWin;
		latest?: TournamentRunGraphicSeriesWin;
	};
}) {
	const { t } = useTranslation(["tournament"]);

	const setsWon = matches.filter(
		(match) => match.ownScore > match.opponentScore,
	).length;
	const setsLost = matches.length - setsWon;
	const mapsWon = R.sumBy(matches, (match) => match.ownScore);
	const mapsLost = R.sumBy(matches, (match) => match.opponentScore);

	return (
		<GraphicContainer>
			<TournamentGraphicHeader
				tournamentName={tournamentName}
				startTime={startTime}
				logoUrl={logoUrl}
				tier={tier}
				organization={organization}
			/>
			<GraphicTeamRow as="div" team={team} className={styles.ownTeamRow} />
			<GraphicStatsRow>
				<GraphicStat label={t("tournament:team.placement")}>
					<GraphicPlacementCell placement={team.placement} />
				</GraphicStat>
				{typeof seed === "number" ? (
					<GraphicStat label={t("tournament:team.seed")}>{seed}</GraphicStat>
				) : null}
				<GraphicStat label={t("tournament:run.sets")}>
					<GraphicWonLost won={setsWon} lost={setsLost} />
				</GraphicStat>
				<GraphicStat label={t("tournament:run.maps")}>
					<GraphicWonLost won={mapsWon} lost={mapsLost} />
				</GraphicStat>
			</GraphicStatsRow>
			{team.placement === 1 && seriesWins ? (
				<GraphicStatsRow>
					<SeriesWinStat
						label={t("tournament:run.firstTitle")}
						win={seriesWins.first}
					/>
					{seriesWins.latest ? (
						<SeriesWinStat
							label={t("tournament:run.latestTitle")}
							win={seriesWins.latest}
						/>
					) : null}
					<GraphicStat label={t("tournament:run.seriesTitles")}>
						<span className={styles.seriesTitlesCount}>
							{seriesWins.totalCount}
						</span>
					</GraphicStat>
				</GraphicStatsRow>
			) : null}
			<GraphicTeamsList>
				{matches.map((match, index) => {
					const previousMatch = matches[index - 1];
					const qualifiedForBracket =
						previousMatch && previousMatch.bracketName !== match.bracketName;

					return (
						<React.Fragment key={`${index}-${match.opponent.name}`}>
							{qualifiedForBracket ? (
								<GraphicSectionDivider as="li">
									<ArrowDown size={14} />
									{t("tournament:run.qualifiedFor", {
										bracket: match.bracketName,
									})}
								</GraphicSectionDivider>
							) : null}
							<GraphicTeamRow
								className={styles.matchRow}
								team={match.opponent}
								leading={
									<div className={styles.matchLeading}>
										<div
											className={clsx(graphicStyles.boxLabel, styles.roundName)}
										>
											{match.roundName}
										</div>
										<GraphicScore
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
			<TournamentGraphicFooter
				teamsCount={teamsCount}
				playersCount={playersCount}
				path={tournamentTeamPage({ tournamentId, tournamentTeamId })}
			/>
		</GraphicContainer>
	);
}

function SeriesWinStat({
	label,
	win,
}: {
	label: string;
	win: TournamentRunGraphicSeriesWin;
}) {
	return (
		<GraphicStat label={label}>
			<div className={styles.seriesWin}>
				<div className={styles.seriesWinName}>{win.name}</div>
				<LocaleTime
					date={win.startTime}
					options={SERIES_WIN_DATE_FORMAT_OPTIONS}
					className={styles.seriesWinDate}
				/>
			</div>
		</GraphicStat>
	);
}
