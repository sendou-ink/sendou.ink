import clsx from "clsx";
import { HardDriveDownload } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { Link, useFetcher, useLoaderData } from "react-router";
import { Avatar } from "~/components/Avatar";
import { SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
import { ModeImage, StageImage } from "~/components/Image";
import { Placement } from "~/components/Placement";
import { useUser } from "~/features/auth/core/user";
import { ImageExportDialog } from "~/features/img-export/components/ImageExportDialog";
import { TournamentRunGraphic } from "~/features/img-export/components/TournamentRunGraphic";
import type {
	TournamentData,
	TournamentDataTeam,
} from "~/features/tournament-bracket/core/Tournament.server";
import type { TournamentMaplistSource } from "~/modules/tournament-map-list-generator/types";
import { metaTags } from "~/utils/remix";
import {
	teamPage,
	tournamentMatchPage,
	tournamentTeamCompsPage,
	tournamentTeamPage,
	userPage,
} from "~/utils/urls";
import { TeamWithRoster } from "../components/TeamWithRoster";
import * as Standings from "../core/Standings";
import type { PlayedSet } from "../core/sets.server";
import type { TournamentTeamCompsLoaderData } from "../loaders/to.$id.teams.$tid.comps.server";
import { loader } from "../loaders/to.$id.teams.$tid.server";
import styles from "../tournament.module.css";
import { useTournament } from "./to.$id";

export { loader };

export const meta: MetaFunction<typeof loader> = (args) => {
	const tournamentData = JSON.parse(args.matches[1].loaderData as any)
		?.tournament as TournamentData;
	if (!args.loaderData || !tournamentData) return [];

	const team = tournamentData.ctx.teams.find(
		(t) => t.id === args.loaderData!.tournamentTeamId,
	)!;
	const teamLogoUrl = team.team?.logoUrl ?? team.pickupAvatarUrl;

	return metaTags({
		title: `${team.name} @ ${tournamentData.ctx.name}`,
		description: `${team.name} roster (${team.members.map((m) => m.username).join(", ")}) and sets in ${tournamentData.ctx.name}.`,
		image: teamLogoUrl
			? {
					url: teamLogoUrl,
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
	const team = tournament.teamById(data.tournamentTeamId)!;

	return (
		<div className="stack lg">
			<div className="stack sm">
				<TeamWithRoster
					team={team}
					mapPool={team.mapPool}
					activePlayers={
						data.sets.length > 0
							? tournament
									.participatedPlayersByTeamId(team.id)
									.map((p) => p.userId)
							: undefined
					}
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
	const tournament = useTournament();

	const standingsResult = Standings.tournamentStandings(tournament);
	const overallStandings = Standings.flattenStandings(standingsResult);
	const placement = overallStandings.find(
		(s) => s.team.id === data.tournamentTeamId,
	)?.placement;

	const undergroundBracket = tournament.brackets.find((b) => b.isUnderground);
	const undergroundPlacement = undergroundBracket?.standings.find(
		(s) => s.team.id === data.tournamentTeamId,
	)?.placement;

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
				{standingsResult.type === "multi" ? (
					<div className={styles.teamStatSub}>
						{
							standingsResult.standings.find((s) =>
								s.standings.some((s) => s.team.id === data.tournamentTeamId),
							)?.div
						}
					</div>
				) : null}
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

	const team = tournament.teamById(data.tournamentTeamId);
	const isOwnTeam = Boolean(
		team?.members.some((member) => member.userId === user?.id),
	);

	const placement = Standings.flattenStandings(
		Standings.tournamentStandings(tournament),
	).find((standing) => standing.team.id === data.tournamentTeamId)?.placement;

	if (!team || !isOwnTeam || typeof placement !== "number") return null;

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

	const participatedPlayers = tournament.participatedPlayersByTeamId(team.id);
	const ownPlayers =
		participatedPlayers.length > 0 ? participatedPlayers : team.members;

	const graphicTeam = {
		placement,
		name: team.name,
		logoUrl: tournament.tournamentTeamLogoSrc(team) ?? undefined,
		players: ownPlayers.map((player) => ({
			name: player.username,
			countryCode: player.country ?? undefined,
		})),
		weapons: fetcher.data?.ownComp ?? [],
	};

	const matches = data.sets.map((set) => {
		const { bracketName, roundNameWithoutMatchIdentifier } =
			tournament.matchContextNamesById(set.tournamentMatchId);
		const opponentTeam = tournament.teamById(set.opponent.id);

		return {
			opponent: {
				name: set.opponent.name,
				logoUrl: opponentTeam
					? (tournament.tournamentTeamLogoSrc(opponentTeam) ?? undefined)
					: undefined,
				seed: opponentTeam?.seed,
				players: set.opponent.roster.map((rosterUser) => ({
					name: rosterUser.username,
					countryCode:
						opponentTeam?.members.find(
							(member) => member.userId === rosterUser.id,
						)?.country ?? undefined,
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
				// xxx: pass seriesWins so 1st place finishes show the series titles row
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
					seed={team.seed}
					matches={matches}
					teamsCount={tournament.ctx.teams.length}
					playersCount={tournament.ctx.participatedUsers.length}
				/>
			) : null}
		</ImageExportDialog>
	);
}

function SetInfo({ set, team }: { set: PlayedSet; team: TournamentDataTeam }) {
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
		tournament.matchContextNamesById(set.tournamentMatchId);

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
