import clsx from "clsx";
import { HardDriveDownload } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { Link, useFetcher, useLoaderData } from "react-router";
import { SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
import { ModeImage, StageImage } from "~/components/Image";
import { Placement } from "~/components/Placement";
import { UserLink } from "~/components/UserLink";
import { useUser } from "~/features/auth/core/user";
import { ImageExportDialog } from "~/features/img-export/components/ImageExportDialog";
import {
	TournamentRunGraphic,
	type TournamentRunGraphicSeriesWin,
} from "~/features/img-export/components/TournamentRunGraphic";
import { useTournament } from "~/features/tournament/tournament-context";
import type { TournamentTeamFull } from "~/features/tournament-bracket/core/Tournament.server";
import type { TournamentMaplistSource } from "~/modules/tournament-map-list-generator/types";
import { metaTags } from "~/utils/remix";
import {
	teamPage,
	tournamentMatchPage,
	tournamentTeamCompsPage,
	tournamentTeamPage,
} from "~/utils/urls";
import { TeamWithRoster } from "../components/TeamWithRoster";
import type { TournamentTeamCompsLoaderData } from "../loaders/to.$id.teams.$tid.comps.server";
import {
	loader,
	type TournamentTeamLoaderData,
} from "../loaders/to.$id.teams.$tid.server";
import styles from "./to.$id.teams.$tid.module.css";

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
	const { t } = useTranslation(["tournament"]);
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
						{t("tournament:team.teamPage")}
					</Link>
				) : null}
			</div>
			{data.winCounts.sets.total > 0 ? (
				<StatSquares
					seed={teamIndex + 1}
					teamsCount={tournament.ctx.teams.length}
				/>
			) : null}
			<RunImageExport />
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

function RunImageExport() {
	const { t } = useTranslation(["common"]);
	const user = useUser();
	const data = useLoaderData<typeof loader>();
	const tournament = useTournament();
	const fetcher = useFetcher<TournamentTeamCompsLoaderData>();

	const isOwnTeam = data.team.members.some(
		(member) => member.userId === user?.id,
	);

	if (!isOwnTeam || typeof data.placement !== "number") return null;

	const handleOpen = () => {
		if (fetcher.state === "idle" && !fetcher.data) {
			fetcher.load(
				tournamentTeamCompsPage({
					tournamentId: tournament.ctx.id,
					tournamentTeamId: data.tournamentTeamId,
				}),
			);
		}
	};

	const compByMatchId = new Map(
		fetcher.data?.opponentComps.map((opponentComp) => [
			opponentComp.tournamentMatchId,
			opponentComp.comp,
		]),
	);

	const seriesWins = seriesWinsForGraphic({
		placement: data.placement,
		previousWins: fetcher.data?.previousSeriesWins,
		currentWin: {
			name: tournament.ctx.name,
			startTime: tournament.ctx.startsAt,
		},
	});

	const activePlayers = data.activePlayers ?? [];
	const ownPlayers =
		activePlayers.length > 0
			? data.team.members.filter((member) =>
					activePlayers.includes(member.userId),
				)
			: data.team.members;

	const graphicTeam = {
		placement: data.placement,
		name: data.team.name,
		logoUrl: data.team.logoUrl ?? undefined,
		players: ownPlayers.map((player) => ({
			name: player.username,
			countryCode: player.country ?? undefined,
		})),
		weapons: fetcher.data?.ownComp ?? [],
	};

	const matches = data.sets.map((set) => {
		const { bracketName, roundNameWithoutMatchIdentifier } =
			set.matchContextNames;
		const opponentTeam = tournament.teamById(set.opponent.id);

		return {
			opponent: {
				name: set.opponent.name,
				logoUrl: opponentTeam?.logoUrl ?? undefined,
				seed: opponentTeam?.seed,
				players: set.opponent.roster.map((rosterUser) => ({
					name: rosterUser.username,
					countryCode: rosterUser.country ?? undefined,
				})),
				weapons: compByMatchId.get(set.tournamentMatchId) ?? [],
			},
			ownScore: set.score[0],
			opponentScore: set.score[1],
			roundName: roundNameWithoutMatchIdentifier ?? "",
			bracketName: bracketName ?? "",
		};
	});

	return (
		<ImageExportDialog
			trigger={
				<SendouButton
					size="small"
					variant="outlined"
					icon={<HardDriveDownload />}
					onPress={handleOpen}
					className="mx-auto"
				>
					{t("common:imageExport.export")}
				</SendouButton>
			}
			heading={t("common:imageExport.export")}
			filename={`tournament-${tournament.ctx.id}-run`}
		>
			{fetcher.data ? (
				<TournamentRunGraphic
					tournamentId={tournament.ctx.id}
					tournamentTeamId={data.tournamentTeamId}
					tournamentName={tournament.ctx.name}
					startTime={tournament.ctx.startsAt}
					logoUrl={tournament.ctx.logoUrl ?? undefined}
					tier={tournament.ctx.tier ?? undefined}
					organization={
						tournament.ctx.organization
							? {
									name: tournament.ctx.organization.name,
									avatarUrl: tournament.ctx.organization.logoUrl ?? undefined,
								}
							: undefined
					}
					team={graphicTeam}
					seed={tournament.teamById(data.tournamentTeamId)?.seed}
					matches={matches}
					teamsCount={tournament.ctx.teams.length}
					playersCount={data.participatedUsersCount}
					seriesWins={seriesWins}
				/>
			) : null}
		</ImageExportDialog>
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
				<div className={styles.teamSetOpponentVs}>
					{t("tournament:team.vs")}
				</div>
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
							<UserLink
								key={user.id}
								user={user}
								className={styles.teamSetOpponentMember}
							/>
						);
					})}
				</div>
			</div>
		</div>
	);
}

/** The current win is part of the count, but only shown when the team has no earlier title. */
function seriesWinsForGraphic({
	placement,
	previousWins,
	currentWin,
}: {
	placement?: number;
	previousWins?: TournamentRunGraphicSeriesWin[] | null;
	currentWin: TournamentRunGraphicSeriesWin;
}) {
	if (placement !== 1 || !previousWins) return;

	return {
		totalCount: previousWins.length + 1,
		first: previousWins[0] ?? currentWin,
		latest: previousWins.length > 1 ? previousWins.at(-1) : undefined,
	};
}
