import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { SendouTabPanel } from "~/components/elements/Tabs";
import { ModeImage, StageImage } from "~/components/Image";
import { TAB_KEYS } from "~/components/match-page/MatchTabs";
import * as PickBan from "~/features/tournament-bracket/core/PickBan";
import type { TournamentDataTeam } from "~/features/tournament-bracket/core/Tournament.server";
import { shortStageName } from "~/modules/in-game-lists/stage-ids";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import type { TournamentMatchLoaderData } from "../loaders/to.$id.matches.$mid.server";
import styles from "./TournamentMatchPickBanTab.module.css";

interface EventEntry {
	stageId: StageId | null;
	mode: ModeShort | null;
}

interface TeamBuckets {
	picks: EventEntry[];
	bans: EventEntry[];
}

export function TournamentMatchPickBanTab({
	data,
	teams,
}: {
	data: TournamentMatchLoaderData;
	teams: [TournamentDataTeam, TournamentDataTeam];
}) {
	const maps = data.match.roundMaps;
	if (!maps?.pickBan) return null;

	const pickBanTeams: [PickBan.PickBanTeam, PickBan.PickBanTeam] = [
		{ id: teams[0].id, seed: teams[0].seed ?? 0 },
		{ id: teams[1].id, seed: teams[1].seed ?? 0 },
	];

	const teamOneBuckets: TeamBuckets = { picks: [], bans: [] };
	const teamTwoBuckets: TeamBuckets = { picks: [], bans: [] };

	for (let i = 0; i < data.pickBanEvents.length; i++) {
		const event = data.pickBanEvents[i]!;
		if (event.type === "ROLL") continue;

		const teamId = PickBan.teamOfEvent({
			eventIndex: i,
			maps,
			teams: pickBanTeams,
			results: data.results,
		});
		if (teamId === null) continue;

		const isPick = event.type === "PICK" || event.type === "MODE_PICK";
		const bucket =
			teamId === teams[0].id
				? teamOneBuckets
				: teamId === teams[1].id
					? teamTwoBuckets
					: null;
		if (!bucket) continue;

		bucket[isPick ? "picks" : "bans"].push({
			stageId: event.stageId,
			mode: event.mode,
		});
	}

	return (
		<SendouTabPanel id={TAB_KEYS.PICK_BAN}>
			<div className={styles.container}>
				<TeamSection teamName={teams[0].name} buckets={teamOneBuckets} />
				<TeamSection teamName={teams[1].name} buckets={teamTwoBuckets} />
			</div>
		</SendouTabPanel>
	);
}

function TeamSection({
	teamName,
	buckets,
}: {
	teamName: string;
	buckets: TeamBuckets;
}) {
	const { t } = useTranslation(["tournament"]);

	const hasPicks = buckets.picks.length > 0;
	const hasBans = buckets.bans.length > 0;

	return (
		<section className={styles.teamSection}>
			<h2 className={styles.teamHeading}>{teamName}</h2>
			{!hasPicks && !hasBans ? (
				<div className={styles.emptyText}>
					{t("tournament:match.pickBan.noEvents")}
				</div>
			) : (
				<>
					{hasPicks ? (
						<EventGroup
							heading={t("tournament:match.pickBan.picks")}
							headingClassName={styles.groupHeadingPicks}
							entries={buckets.picks}
						/>
					) : null}
					{hasBans ? (
						<EventGroup
							heading={t("tournament:match.pickBan.bans")}
							headingClassName={styles.groupHeadingBans}
							entries={buckets.bans}
						/>
					) : null}
				</>
			)}
		</section>
	);
}

function EventGroup({
	heading,
	headingClassName,
	entries,
}: {
	heading: string;
	headingClassName: string;
	entries: EventEntry[];
}) {
	return (
		<div className={styles.group}>
			<h3 className={clsx(styles.groupHeading, headingClassName)}>{heading}</h3>
			<div className={styles.entries}>
				{entries.map((entry, i) => (
					<Entry key={i} entry={entry} />
				))}
			</div>
		</div>
	);
}

function Entry({ entry }: { entry: EventEntry }) {
	const { t } = useTranslation(["game-misc"]);

	if (entry.stageId !== null) {
		return (
			<div className={styles.mapEntry}>
				<StageImage
					stageId={entry.stageId}
					height={50}
					width={90}
					className={styles.stageImage}
				/>
				<div className={styles.mapLabel}>
					{entry.mode ? <ModeImage mode={entry.mode} size={14} /> : null}
					<span>{shortStageName(t(`game-misc:STAGE_${entry.stageId}`))}</span>
				</div>
			</div>
		);
	}

	if (entry.mode !== null) {
		return (
			<div className={styles.mapEntry}>
				<div className={styles.modeTile}>
					<ModeImage mode={entry.mode} size={32} />
				</div>
				<div className={styles.mapLabel}>
					<span>{t(`game-misc:MODE_LONG_${entry.mode}`)}</span>
				</div>
			</div>
		);
	}

	return null;
}
