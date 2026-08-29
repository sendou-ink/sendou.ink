import clsx from "clsx";
import { differenceInDays } from "date-fns";
import { ShieldMinus } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link, useLoaderData } from "react-router";
import { Avatar } from "~/components/Avatar";
import { SendouButton } from "~/components/elements/Button";
import {
	SendouTab,
	SendouTabList,
	SendouTabPanel,
	SendouTabs,
} from "~/components/elements/Tabs";
import { Flag } from "~/components/Flag";
import { InfoPopover } from "~/components/InfoPopover";
import { Placement } from "~/components/Placement";
import { Table } from "~/components/Table";
import { useTournament } from "~/features/tournament/tournament-context";
import { useSpoilerFree } from "~/hooks/useSpoilerFree";
import {
	SPR_INFO_URL,
	tournamentMatchPage,
	tournamentTeamPage,
} from "~/utils/urls";
import type { TournamentResultsLoaderData } from "../loaders/to.$id.results.server";
import { TOURNAMENT } from "../tournament-constants";
import styles from "./to.$id.results.module.css";

export { loader } from "../loaders/to.$id.results.server";

type ResultsStanding =
	TournamentResultsLoaderData["standings"]["standings"] extends Array<infer T>
		? T extends { standings: Array<infer U> }
			? U
			: T
		: never;

export default function TournamentResultsPage() {
	const { t } = useTranslation(["common", "tournament"]);
	const { standings: standingsResult } =
		useLoaderData<TournamentResultsLoaderData>();
	const tournament = useTournament();
	const { isCensored, reveal } = useSpoilerFree();

	const withinSpoilerWindow =
		differenceInDays(new Date(), tournament.ctx.startsAt) <
		TOURNAMENT.VOD_VISIBILITY_DAYS;
	const censored = withinSpoilerWindow && isCensored(tournament.ctx.id);

	if (censored) {
		return (
			<div className={styles.spoilerRevealContainer}>
				<SendouButton
					variant="outlined"
					size="big"
					onPress={() => reveal(tournament.ctx.id)}
					icon={<ShieldMinus />}
				>
					{t("common:spoilerFree.showResults")}
				</SendouButton>
			</div>
		);
	}

	if (standingsResult.type === "single") {
		if (standingsResult.standings.length === 0) {
			return (
				<div className="text-center text-lg font-semi-bold text-lighter">
					{t("tournament:results.empty")}
				</div>
			);
		}

		return (
			<div>
				<ResultsTable standings={standingsResult.standings} />
			</div>
		);
	}

	return (
		<SendouTabs>
			<SendouTabList>
				{standingsResult.standings.map(({ div }) => (
					<SendouTab key={div} id={div}>
						{div}
					</SendouTab>
				))}
			</SendouTabList>
			{standingsResult.standings.map(({ div, standings }) => (
				<SendouTabPanel key={div} id={div}>
					{standings.length === 0 ? (
						<div className="text-center text-lg font-semi-bold text-lighter">
							{t("tournament:results.empty")}
						</div>
					) : (
						<ResultsTable standings={standings} />
					)}
				</SendouTabPanel>
			))}
		</SendouTabs>
	);
}

function ResultsTable({ standings }: { standings: ResultsStanding[] }) {
	const { t } = useTranslation(["tournament"]);
	const tournament = useTournament();

	let lastRenderedPlacement = 0;
	let rowDarkerBg = false;

	return (
		<Table noRowHover>
			<thead>
				<tr>
					<th>{t("tournament:results.column.standing")}</th>
					<th>{t("tournament:team.label")}</th>
					<th>{t("tournament:results.column.roster")}</th>
					<th>{t("tournament:team.seed")}</th>
					{tournament.ctx.isFinalized ? (
						<th
							className="stack horizontal sm items-center"
							data-testid="spr-header"
						>
							{t("tournament:results.column.spr")}{" "}
							<InfoPopover tiny>
								<a
									href={SPR_INFO_URL}
									target="_blank"
									rel="noopener noreferrer"
								>
									{t("tournament:results.spr.full")}
								</a>
							</InfoPopover>
						</th>
					) : null}
					<th>{t("tournament:results.column.matches")}</th>
				</tr>
			</thead>
			<tbody>
				{standings.map((standing, i) => {
					const placement =
						lastRenderedPlacement === standing.placement
							? null
							: standing.placement;
					lastRenderedPlacement = standing.placement;

					if (standing.placement !== standings[i - 1]?.placement) {
						rowDarkerBg = !rowDarkerBg;
					}

					const teamLogoSrc = standing.team.logoUrl;

					return (
						<tr
							key={standing.team.id}
							className={rowDarkerBg ? styles.standingsRowAlt : undefined}
						>
							<td className="text-md">
								{typeof placement === "number" ? (
									<Placement placement={placement} size={36} />
								) : null}{" "}
							</td>
							<td>
								<Link
									to={tournamentTeamPage({
										tournamentId: tournament.ctx.id,
										tournamentTeamId: standing.team.id,
									})}
									className={styles.standingsTeamName}
									data-testid="result-team-name"
									title={standing.team.name}
								>
									<Avatar
										size="xs"
										url={teamLogoSrc}
										identiconInput={standing.team.name}
									/>
									<span className={styles.standingsTeamNameText}>
										{standing.team.name}
									</span>
								</Link>
							</td>
							<td>
								{standing.roster.map((player) => (
									<div
										key={player.userId}
										className="stack xxs horizontal items-center"
									>
										{player.country ? (
											<Flag countryCode={player.country} tiny />
										) : null}
										{player.username}
									</div>
								))}
							</td>
							<td className="text-sm">{standing.team.seed}</td>
							{tournament.ctx.isFinalized ? (
								<td className="text-sm">
									{standing.spr > 0 ? "+" : ""}
									{standing.spr}
								</td>
							) : null}
							<td>
								<MatchHistoryRow matches={standing.matches} />
							</td>
						</tr>
					);
				})}
			</tbody>
		</Table>
	);
}

function MatchHistoryRow({
	matches: teamMatches,
}: {
	matches: ResultsStanding["matches"];
}) {
	return (
		<div className="stack horizontal xs">
			{teamMatches.map((match, i) => {
				const bracketChanged =
					i !== 0 && teamMatches[i - 1].bracketIdx !== match.bracketIdx;

				return (
					<React.Fragment key={match.id}>
						{bracketChanged ? (
							<div className={styles.standingsDivider} />
						) : null}
						<MatchResultSquare result={match.result} matchId={match.id}>
							{match.vsSeed}
						</MatchResultSquare>
					</React.Fragment>
				);
			})}
		</div>
	);
}

function MatchResultSquare({
	result,
	matchId,
	children,
}: {
	result: "win" | "loss";
	matchId: number;
	children: React.ReactNode;
}) {
	const tournament = useTournament();

	return (
		<Link
			to={tournamentMatchPage({
				matchId,
				tournamentId: tournament.ctx.id,
			})}
			className={clsx(styles.standingsMatchResultSquare, {
				[styles.standingsMatchResultSquareWin]: result === "win",
				[styles.standingsMatchResultSquareLoss]: result === "loss",
			})}
		>
			{children}
		</Link>
	);
}
