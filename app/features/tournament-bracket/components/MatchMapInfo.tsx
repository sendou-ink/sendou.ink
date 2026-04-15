import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";
import { ModeImage, StageImage } from "~/components/Image";
import type { CustomPickBanStep } from "~/db/tables";
import { useTournament } from "~/features/tournament/routes/to.$id";
import * as PickBan from "~/features/tournament-bracket/core/PickBan";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import type { TournamentMatchLoaderData } from "../loaders/to.$id.matches.$mid.server";
import styles from "./MatchMapInfo.module.css";

export function MatchMapInfo({ teams }: { teams: [number, number] }) {
	const data = useLoaderData<TournamentMatchLoaderData>();
	const tournament = useTournament();

	const teamOne = tournament.teamById(teams[0]);
	const teamTwo = tournament.teamById(teams[1]);

	const customFlow = data.match.roundMaps?.customFlow;
	if (!customFlow) return null;

	const pickBanTeams: [PickBan.PickBanTeam, PickBan.PickBanTeam] = [
		{ id: teams[0], seed: teamOne?.seed ?? 0 },
		{ id: teams[1], seed: teamTwo?.seed ?? 0 },
	];

	const teamOneBans: BanEvent[] = [];
	const teamTwoBans: BanEvent[] = [];

	for (let i = 0; i < data.pickBanEvents.length; i++) {
		const event = data.pickBanEvents[i]!;
		if (event.type !== "BAN" && event.type !== "MODE_BAN") continue;

		const teamId = resolveTeamForEvent({
			eventIndex: i,
			preSet: customFlow.preSet,
			postGame: customFlow.postGame,
			teams: pickBanTeams,
			results: data.results,
		});

		if (teamId === teams[0]) {
			teamOneBans.push(event);
		} else if (teamId === teams[1]) {
			teamTwoBans.push(event);
		}
	}

	return (
		<div className={styles.container}>
			<div className="stack md">
				<BanSection teamName={teamOne?.name ?? "???"} bans={teamOneBans} />
				<BanSection teamName={teamTwo?.name ?? "???"} bans={teamTwoBans} />
				<PlayedSection results={data.results} />
			</div>
		</div>
	);
}

function resolveTeamForEvent({
	eventIndex,
	preSet,
	postGame,
	teams,
	results,
}: {
	eventIndex: number;
	preSet: CustomPickBanStep[];
	postGame: CustomPickBanStep[];
	teams: [PickBan.PickBanTeam, PickBan.PickBanTeam];
	results: Array<{ winnerTeamId: number }>;
}): number | null {
	const step =
		eventIndex < preSet.length
			? preSet[eventIndex]
			: postGame[(eventIndex - preSet.length) % postGame.length];

	if (!step?.side) return null;

	// PickBan.resolveTeamFromSide uses the last element of results for WINNER/LOSER,
	// but here we iterate over all historical events so we need to slice
	// results to the correct post-game cycle
	if (step.side === "WINNER" || step.side === "LOSER") {
		const cycleIndex = Math.floor(
			(eventIndex - preSet.length) / postGame.length,
		);
		if (!results[cycleIndex]) return null;

		return PickBan.resolveTeamFromSide({
			side: step.side,
			teams,
			results: results.slice(0, cycleIndex + 1),
		});
	}

	return PickBan.resolveTeamFromSide({
		side: step.side,
		teams,
		results,
	});
}

interface BanEvent {
	stageId: StageId | null;
	mode: ModeShort | null;
	type: string;
}

function BanSection({
	teamName,
	bans,
}: {
	teamName: string;
	bans: BanEvent[];
}) {
	const { t } = useTranslation(["game-misc", "tournament"]);
	const mapBans = bans.filter(
		(b): b is BanEvent & { stageId: StageId; mode: ModeShort } =>
			b.type === "BAN" && b.stageId !== null && b.mode !== null,
	);
	const modeBans = bans.filter(
		(b): b is BanEvent & { mode: ModeShort } =>
			b.type === "MODE_BAN" && b.mode !== null,
	);

	return (
		<div className={styles.section}>
			<h2 className={styles.heading}>
				{t("tournament:match.mapInfo.bans", { teamName })}
			</h2>
			{mapBans.length === 0 && modeBans.length === 0 ? (
				<div className={styles.emptyText}>
					{t("tournament:match.mapInfo.noBans")}
				</div>
			) : null}
			{mapBans.length > 0 ? (
				<div className={styles.maps}>
					{mapBans.map((ban, i) => (
						<MapEntry key={i} stageId={ban.stageId} />
					))}
				</div>
			) : null}
			{modeBans.length > 0 ? (
				<div className={styles.maps}>
					{modeBans.map((ban, i) => (
						<div key={i} className={styles.modeEntry}>
							<ModeImage mode={ban.mode} size={24} />
							{t(`game-misc:MODE_LONG_${ban.mode}`)}
						</div>
					))}
				</div>
			) : null}
		</div>
	);
}

function PlayedSection({
	results,
}: {
	results: Array<{ stageId: StageId; mode: ModeShort }>;
}) {
	const { t } = useTranslation(["game-misc", "tournament"]);

	return (
		<div className={styles.section}>
			<h2 className={styles.heading}>
				{t("tournament:match.mapInfo.playedStages")}
			</h2>
			{results.length === 0 ? (
				<div className={styles.emptyText}>
					{t("tournament:match.mapInfo.noPlayedStages")}
				</div>
			) : (
				<div className={styles.maps}>
					{results.map((result, i) => (
						<MapEntry key={i} stageId={result.stageId} />
					))}
				</div>
			)}
		</div>
	);
}

function MapEntry({ stageId, mode }: { stageId: StageId; mode?: ModeShort }) {
	const { t } = useTranslation(["game-misc"]);

	return (
		<div className={styles.mapEntry}>
			<StageImage
				stageId={stageId}
				height={50}
				width={90}
				className={styles.stageImage}
			/>
			<div className={styles.mapLabel}>
				{mode ? `${t(`game-misc:MODE_SHORT_${mode}`)} ` : null}
				{t(`game-misc:STAGE_${stageId}`).split(" ")[0]}
			</div>
		</div>
	);
}
