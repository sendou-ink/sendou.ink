import clsx from "clsx";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { type MetaFunction, useLoaderData, useRevalidator } from "react-router";
import { scheduleBroadcastRevalidation } from "~/features/chat/revalidation-scope";
import { HEARTBEAT_INTERVAL_MS } from "~/features/events/events-types";
import { useFormatDistanceToNow } from "~/hooks/intl/useFormatDistanceToNow";
import { useAutoRerender } from "~/hooks/useAutoRerender";
import { useHydrated } from "~/hooks/useHydrated";
import { metaTitle } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { tournamentStationsDisplayPage } from "~/utils/urls";
import type {
	StationsDisplayMatch,
	StationsDisplaySide,
	StationsDisplayStation,
} from "../core/StationsDisplay";
import type { TournamentStationsDisplayLoaderData } from "../loaders/to.$id.stations.display.server";
import { useStartsInText } from "../tournament-stations-hooks";
import type { StationsDisplayStreamMessage } from "../tournament-stations-types";
import styles from "./to.$id.stations.display.module.css";

export { loader } from "../loaders/to.$id.stations.display.server";

/** A connection that went this long without a heartbeat is dead without having errored, so it's opened again. */
const STREAM_SILENCE_LIMIT_MS = HEARTBEAT_INTERVAL_MS * 2.5;

export const handle: SendouRouteHandle = {
	i18n: ["tournament"],
	bare: true,
};

export const meta: MetaFunction = (args) => {
	const data = args.loaderData as
		| TournamentStationsDisplayLoaderData
		| undefined;
	if (!data) return [];

	return metaTitle({ title: `Stations · ${data.tournamentName}` });
};

export default function TournamentStationsDisplayPage() {
	const data = useLoaderData<TournamentStationsDisplayLoaderData>();

	useStationsDisplayStream(data);

	return (
		<div className={styles.screen} data-theme="dark">
			<header className={styles.header}>
				<img
					src={data.logoUrl}
					alt=""
					className={styles.logo}
					width={125}
					height={125}
				/>
				<h1 className={styles.tournamentName}>{data.tournamentName}</h1>
				<LastUpdated loadedAt={data.loadedAt} />
			</header>
			<DisplayContent data={data} />
		</div>
	);
}

function DisplayContent({
	data,
}: {
	data: TournamentStationsDisplayLoaderData;
}) {
	const { t } = useTranslation(["tournament"]);

	if (data.isFinalized) {
		return (
			<p className={styles.notice}>
				{t("tournament:stations.display.finalized")}
			</p>
		);
	}

	if (data.stations.length === 0) {
		return (
			<p className={styles.notice}>
				{t("tournament:stations.display.noStations")}
			</p>
		);
	}

	return (
		<>
			{!data.hasStarted ? (
				<p className={styles.notice}>
					{t("tournament:stations.board.notStarted")}
				</p>
			) : null}
			<main className={styles.grid}>
				{data.stations.map((station) => (
					<StationCard key={station.id} station={station} />
				))}
			</main>
			{data.waiting.length > 0 ? <WaitingStrip matches={data.waiting} /> : null}
		</>
	);
}

function StationCard({ station }: { station: StationsDisplayStation }) {
	const { t } = useTranslation(["tournament"]);

	return (
		<section
			className={styles.station}
			aria-label={station.name}
			data-testid={`display-station-${station.id}`}
		>
			<div className={styles.stationHeader}>
				<h2 className={styles.stationName}>{station.name}</h2>
				{station.locationNote ? (
					<span className={styles.locationNote}>{station.locationNote}</span>
				) : null}
			</div>
			<div
				className={styles.slot}
				data-testid={`display-station-${station.id}-now`}
			>
				<span className={clsx(styles.slotLabel, styles.slotLabelNow)}>
					{t("tournament:stations.board.now")}
				</span>
				{station.now ? (
					<DisplayMatch match={station.now} showScore />
				) : (
					<span className={styles.free}>
						{t("tournament:stations.display.free")}
					</span>
				)}
			</div>
			{station.next ? (
				<div
					className={clsx(styles.slot, styles.slotNext)}
					data-testid={`display-station-${station.id}-next`}
				>
					<span className={styles.slotLabel}>
						{t("tournament:stations.board.next")}
					</span>
					<DisplayMatch match={station.next} />
				</div>
			) : null}
		</section>
	);
}

function DisplayMatch({
	match,
	showScore = false,
}: {
	match: StationsDisplayMatch;
	showScore?: boolean;
}) {
	const { t } = useTranslation(["common"]);
	const startsIn = useStartsInText(match.eta);
	const hasScore = showScore && match.score.some((score) => score > 0);

	return (
		<div className={styles.match}>
			<span className={styles.matchMeta}>
				<span className={styles.matchName}>{match.name}</span>
				{startsIn ? (
					<span className={styles.eta}>
						{t("common:globalStatus.startsIn", { time: startsIn })}
					</span>
				) : null}
			</span>
			{match.sides.map((side, idx) => (
				<div key={idx} className={styles.side}>
					<SideName side={side} />
					{hasScore ? (
						<span className={styles.score}>{match.score[idx]}</span>
					) : null}
				</div>
			))}
		</div>
	);
}

function LastUpdated({ loadedAt }: { loadedAt: number }) {
	const { t } = useTranslation(["tournament"]);
	const formatDistanceToNow = useFormatDistanceToNow();
	const isHydrated = useHydrated();
	// consumed so the text moves on between refetches
	const now = useAutoRerender("ten seconds");

	if (!isHydrated) return null;

	return (
		<span className={styles.lastUpdated} data-testid="display-last-updated">
			{t("tournament:stations.display.lastUpdated", {
				time: formatDistanceToNow(new Date(Math.min(loadedAt, now.getTime())), {
					addSuffix: true,
				}),
			})}
		</span>
	);
}

function SideName({ side }: { side: StationsDisplaySide }) {
	const { t } = useTranslation(["tournament"]);

	if (side?.type === "TEAM") {
		return <span className={styles.teamName}>{side.name}</span>;
	}

	return (
		<span className={clsx(styles.teamName, styles.teamNameUnknown)}>
			{side?.type === "WINNER_OF"
				? t("tournament:stations.display.winnerOf", { match: side.matchName })
				: side?.type === "LOSER_OF"
					? t("tournament:stations.display.loserOf", { match: side.matchName })
					: t("tournament:match.tbd")}
		</span>
	);
}

function WaitingStrip({ matches }: { matches: StationsDisplayMatch[] }) {
	const { t } = useTranslation(["tournament"]);

	return (
		<section className={styles.waiting} data-testid="display-waiting">
			<h2 className={styles.waitingTitle}>
				{t("tournament:stations.display.waiting")}
			</h2>
			<ol className={styles.waitingList}>
				{matches.map((match) => (
					<li key={match.id} className={styles.waitingMatch}>
						<span className={styles.matchName}>{match.name}</span>
						<span className={styles.waitingTeams}>
							<SideName side={match.sides[0]} />
							<span className={styles.vs}>{t("tournament:team.vs")}</span>
							<SideName side={match.sides[1]} />
						</span>
					</li>
				))}
			</ol>
		</section>
	);
}

/**
 * Refetches the board whenever the display's stream says it may have changed and each time the stream opens. Reopens
 * the stream when it went silent or a started bracket brought new topics.
 */
function useStationsDisplayStream({
	tournamentId,
	topicsKey,
}: TournamentStationsDisplayLoaderData) {
	const { revalidate } = useRevalidator();
	const onChanged = React.useEffectEvent(() =>
		scheduleBroadcastRevalidation(revalidate, undefined),
	);

	React.useEffect(() => {
		if (!topicsKey) return;

		const url = `${tournamentStationsDisplayPage(tournamentId)}/stream`;
		let source: EventSource | null = null;
		let lastMessageAt = Date.now();

		const open = () => {
			source?.close();
			source = new EventSource(url);
			// what changed before the stream listened (page load, a reconnect) is only caught up on by refetching
			source.onopen = () => {
				lastMessageAt = Date.now();
				onChanged();
			};
			source.onmessage = (event) => {
				lastMessageAt = Date.now();
				const message = JSON.parse(event.data) as StationsDisplayStreamMessage;
				if (message.kind === "changed") onChanged();
			};
		};

		open();
		const watchdog = setInterval(() => {
			if (Date.now() - lastMessageAt > STREAM_SILENCE_LIMIT_MS) {
				lastMessageAt = Date.now();
				open();
			}
		}, HEARTBEAT_INTERVAL_MS);

		return () => {
			clearInterval(watchdog);
			source?.close();
		};
	}, [tournamentId, topicsKey]);
}
