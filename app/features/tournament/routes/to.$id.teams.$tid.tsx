import clsx from "clsx";
import { useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { Link, useLoaderData } from "react-router";
import { Avatar } from "~/components/Avatar";
import { SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
import { ModeImage, StageImage } from "~/components/Image";
import { Placement } from "~/components/Placement";
import type { TournamentTeamFull } from "~/features/tournament-bracket/core/Tournament.server";
import type { TournamentMaplistSource } from "~/modules/tournament-map-list-generator/types";
import { metaTags } from "~/utils/remix";
import {
	teamPage,
	tournamentMatchPage,
	tournamentTeamPage,
	userPage,
} from "~/utils/urls";
import { TeamWithRoster } from "../components/TeamWithRoster";
import {
	loader,
	type TournamentTeamLoaderData,
} from "../loaders/to.$id.teams.$tid.server";
import styles from "../tournament.module.css";
import { useTournament } from "./to.$id";

export { loader };

export const meta: MetaFunction<typeof loader> = (args) => {
	if (!args.loaderData) return [];

	const { team, tournamentName } = args.loaderData;

	return metaTags({
		title: `${team.name} @ ${tournamentName}`,
		description: `${team.name} roster (${team.members.map((m) => m.username).join(", ")}) and sets in ${tournamentName}.`,
		image: team.logoUrl
			? {
					url: team.logoUrl,
					dimensions: { width: 124, height: 124 },
				}
			: undefined,
		location: args.location,
	});
};

export default function TournamentTeamPage() {
	const data = useLoaderData<typeof loader>();
	const tournament = useTournament();
	const teamIndex = tournament.ctx.teams.findIndex(
		(t) => t.id === data.tournamentTeamId,
	);
	const team = data.team;

	return (
		<div className="stack lg">
			<div className="stack sm">
				<TeamWithRoster
					team={team}
					mapPool={team.mapPool}
					activePlayers={data.activePlayers}
				/>
				{team.team && !team.team.deletedAt ? (
					<Link
						to={teamPage(team.team.customUrl)}
						className="text-xxs text-center"
					>
						Team page
					</Link>
				) : null}
			</div>
			{data.winCounts.sets.total > 0 ? (
				<StatSquares
					seed={teamIndex + 1}
					teamsCount={tournament.ctx.teams.length}
				/>
			) : null}
			<div className={styles.teamSets}>
				{data.sets.map((set) => {
					return <SetInfo key={set.tournamentMatchId} set={set} team={team} />;
				})}
			</div>
		</div>
	);
}

function StatSquares({
	seed,
	teamsCount,
}: {
	seed: number;
	teamsCount: number;
}) {
	const { t } = useTranslation(["tournament"]);
	const data = useLoaderData<typeof loader>();

	const { placement, undergroundPlacement, division } = data;

	return (
		<div className={styles.teamStats}>
			<div className={styles.teamStat}>
				<div className={styles.teamStatTitle}>
					{t("tournament:team.setWins")}
				</div>
				<div className={styles.teamStatMain}>
					{data.winCounts.sets.won} / {data.winCounts.sets.total}
				</div>
				<div className={styles.teamStatSub}>
					{data.winCounts.sets.percentage}%
				</div>
			</div>

			<div className={styles.teamStat}>
				<div className={styles.teamStatTitle}>
					{t("tournament:team.mapWins")}
				</div>
				<div className={styles.teamStatMain}>
					{data.winCounts.maps.won} / {data.winCounts.maps.total}
				</div>
				<div className={styles.teamStatSub}>
					{data.winCounts.maps.percentage}%
				</div>
			</div>

			<div className={styles.teamStat}>
				<div className={styles.teamStatTitle}>{t("tournament:team.seed")}</div>
				<div className={styles.teamStatMain}>{seed}</div>
				<div className={styles.teamStatSub}>
					{t("tournament:team.seed.footer", { count: teamsCount })}
				</div>
			</div>

			<div className={styles.teamStat}>
				<div className={styles.teamStatTitle}>
					{t("tournament:team.placement")}
				</div>
				<div className={styles.teamStatMain}>
					{placement ? <Placement placement={placement} textOnly /> : "-"}
					{undergroundPlacement ? (
						<>
							{" "}
							/ <Placement placement={undergroundPlacement} textOnly />
						</>
					) : null}
				</div>
				{undergroundPlacement ? (
					<div className={styles.teamStatSub}>
						{t("tournament:team.placement.footer")}
					</div>
				) : null}
				{division ? <div className={styles.teamStatSub}>{division}</div> : null}
			</div>
		</div>
	);
}

function SetInfo({
	set,
	team,
}: {
	set: TournamentTeamLoaderData["sets"][number];
	team: TournamentTeamFull;
}) {
	const { t } = useTranslation(["tournament"]);
	const tournament = useTournament();

	const sourceToText = (source: TournamentMaplistSource, mapIndex: number) => {
		switch (source) {
			case "BOTH":
				return t("tournament:pickInfo.both");
			case "DEFAULT":
				return t("tournament:pickInfo.default");
			case "TIEBREAKER":
				return t("tournament:pickInfo.tiebreaker");
			case "COUNTERPICK": {
				if (mapIndex > 0) {
					const previousMap = set.maps[mapIndex - 1];
					const counterpickerName =
						previousMap.result === "win" ? set.opponent.name : team.name;
					return t("tournament:pickInfo.team.counterpick", {
						team: counterpickerName,
					});
				}
				return t("tournament:pickInfo.counterpick");
			}
			case "TO":
				return null;
			default: {
				const teamName =
					source === set.opponent.id ? set.opponent.name : team.name;

				return t("tournament:pickInfo.team.specific", { team: teamName });
			}
		}
	};

	const { bracketName, roundNameWithoutMatchIdentifier } =
		set.matchContextNames;

	return (
		<div className={styles.teamSet}>
			<div className={styles.teamSetTopContainer}>
				<div className={styles.teamSetScore}>{set.score.join("-")}</div>
				<Link
					to={tournamentMatchPage({
						matchId: set.tournamentMatchId,
						tournamentId: tournament.ctx.id,
					})}
					className={styles.teamSetRoundName}
				>
					{roundNameWithoutMatchIdentifier}{" "}
					{tournament.ctx.settings.bracketProgression.length > 1 ? (
						<>- {bracketName}</>
					) : null}
				</Link>
			</div>
			<div className={styles.overlapDivider}>
				<div className="stack horizontal sm">
					{set.maps.map(({ stageId, modeShort, result, source }, i) => {
						return (
							<SendouPopover
								key={i}
								trigger={
									<SendouButton variant="minimal">
										<ModeImage
											mode={modeShort}
											size={20}
											containerClassName={clsx(styles.teamSetMode, {
												[styles.teamSetModeLoss]: result === "loss",
											})}
										/>
									</SendouButton>
								}
								placement="top"
							>
								<div className={styles.teamSetStageContainer}>
									<StageImage
										stageId={stageId}
										width={125}
										className="rounded-sm"
									/>
									{sourceToText(source, i)}
								</div>
							</SendouPopover>
						);
					})}
				</div>
			</div>
			<div className={styles.teamSetOpponent}>
				<div className={styles.teamSetOpponentVs}>vs.</div>
				<Link
					to={tournamentTeamPage({
						tournamentTeamId: set.opponent.id,
						tournamentId: tournament.ctx.id,
					})}
					className={styles.teamSetOpponentTeam}
				>
					{set.opponent.name}
				</Link>
				<div className={styles.teamSetOpponentMembers}>
					{set.opponent.roster.map((user) => {
						return (
							<Link
								to={userPage(user)}
								key={user.id}
								className={styles.teamSetOpponentMember}
							>
								<Avatar user={user} size="xxs" />
								{user.username}
							</Link>
						);
					})}
				</div>
			</div>
		</div>
	);
}
