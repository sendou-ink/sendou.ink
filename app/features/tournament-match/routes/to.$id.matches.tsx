import clsx from "clsx";
import { Tv } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useLoaderData } from "react-router";
import * as R from "remeda";
import { Avatar } from "~/components/Avatar";
import { SendouSelect, SendouSelectItem } from "~/components/elements/Select";
import {
	SendouTab,
	SendouTabList,
	SendouTabPanel,
	SendouTabs,
} from "~/components/elements/Tabs";
import { LocaleTime } from "~/components/LocaleTime";
import { useTournament } from "~/features/tournament/tournament-context";
import { useSearchParamsTyped } from "~/modules/search-params/hooks";
import { tournamentMatchPage } from "~/utils/urls";
import type {
	TournamentMatchesLoaderData,
	TournamentMatchesLoaderMatch,
} from "../loaders/to.$id.matches.server";
import {
	ALL_DIVISIONS,
	TOURNAMENT_MATCHES_TABS,
	type TournamentMatchesTab,
	tournamentMatchesSearchParams,
} from "../tournament-matches-search-params";
import styles from "./to.$id.matches.module.css";

export { loader } from "../loaders/to.$id.matches.server";

const TIME_FORMAT: Intl.DateTimeFormatOptions = {
	weekday: "short",
	month: "short",
	day: "numeric",
	hour: "numeric",
	minute: "2-digit",
};

export default function TournamentMatchesPage() {
	const { t } = useTranslation(["tournament"]);
	const tournament = useTournament();
	const data = useLoaderData<TournamentMatchesLoaderData>();
	const [{ tab }, setParams] = useSearchParamsTyped(
		tournamentMatchesSearchParams,
	);

	const isTab = (value: unknown): value is TournamentMatchesTab =>
		TOURNAMENT_MATCHES_TABS.some((candidate) => candidate === value);

	return (
		<div className="stack md">
			{tournament.leagueDivisions.length > 1 ? (
				<SendouSelect
					aria-label={t("tournament:matches.division")}
					items={[
						{
							id: ALL_DIVISIONS,
							name: t("tournament:matches.allDivisions"),
						},
						...tournament.leagueDivisions.map((division) => ({
							id: String(division.idx),
							name: division.name,
						})),
					]}
					selectedKey={
						data.divisionIdx === null ? ALL_DIVISIONS : String(data.divisionIdx)
					}
					onSelectionChange={(key) =>
						setParams({
							division: key === ALL_DIVISIONS ? ALL_DIVISIONS : Number(key),
						})
					}
					className={styles.divisionSelect}
					data-testid="matches-division-select"
				>
					{({ id, name }) => (
						<SendouSelectItem key={id} id={id}>
							{name}
						</SendouSelectItem>
					)}
				</SendouSelect>
			) : null}
			<SendouTabs
				selectedKey={tab}
				onSelectionChange={(key) => {
					if (isTab(key)) setParams({ tab: key });
				}}
			>
				<SendouTabList>
					{TOURNAMENT_MATCHES_TABS.map((key) => (
						<SendouTab key={key} id={key} data-testid={`matches-tab-${key}`}>
							{t(`tournament:matches.tabs.${key}`)}
						</SendouTab>
					))}
				</SendouTabList>
				<SendouTabPanel id="scheduled">
					<ScheduledSets matches={data.matches} />
				</SendouTabPanel>
				<SendouTabPanel id="unscheduled">
					<UnscheduledSets matches={data.matches} />
				</SendouTabPanel>
				<SendouTabPanel id="past">
					<PastSets matches={data.matches} />
				</SendouTabPanel>
			</SendouTabs>
		</div>
	);
}

function ScheduledSets({
	matches,
}: {
	matches: Array<TournamentMatchesLoaderMatch>;
}) {
	const { t } = useTranslation(["tournament"]);

	const scheduled = R.sortBy(
		matches.filter(
			(match) => match.scheduledAt !== null && match.winnerTeamId === null,
		),
		(match) => match.scheduledAt ?? 0,
	);

	if (scheduled.length === 0) {
		return <EmptyState>{t("tournament:matches.empty.scheduled")}</EmptyState>;
	}

	return (
		<ul className={styles.list} data-testid="scheduled-sets">
			{scheduled.map((match) => (
				<SetRow
					key={match.id}
					match={match}
					badges={<SetBadges match={match} />}
				>
					{match.scheduledAt !== null ? (
						<LocaleTime
							date={match.scheduledAt}
							options={TIME_FORMAT}
							className={styles.time}
							inline
						/>
					) : null}
				</SetRow>
			))}
		</ul>
	);
}

function UnscheduledSets({
	matches,
}: {
	matches: Array<TournamentMatchesLoaderMatch>;
}) {
	const { t } = useTranslation(["tournament"]);

	const unscheduled = matches.filter((match) => match.isSchedulable);

	if (unscheduled.length === 0) {
		return <EmptyState>{t("tournament:matches.empty.unscheduled")}</EmptyState>;
	}

	const sorted = R.sortBy(
		unscheduled,
		(match) => match.bracketIdx,
		(match) => match.roundNumber,
		(match) => match.roundName,
	);

	return (
		<ul className={styles.list} data-testid="unscheduled-sets">
			{sorted.map((match) => (
				<SetRow key={match.id} match={match} />
			))}
		</ul>
	);
}

function PastSets({
	matches,
}: {
	matches: Array<TournamentMatchesLoaderMatch>;
}) {
	const { t } = useTranslation(["tournament"]);

	const past = R.sortBy(
		matches.filter((match) => match.winnerTeamId !== null),
		[(match) => match.lastResultAt ?? match.scheduledAt ?? 0, "desc"],
	);

	if (past.length === 0) {
		return <EmptyState>{t("tournament:matches.empty.past")}</EmptyState>;
	}

	return (
		<ul className={styles.list} data-testid="past-sets">
			{past.map((match) => (
				<SetRow key={match.id} match={match} showScore>
					{match.lastResultAt !== null ? (
						<LocaleTime
							date={match.lastResultAt}
							options={TIME_FORMAT}
							className={styles.muted}
							inline
						/>
					) : null}
				</SetRow>
			))}
		</ul>
	);
}

function SetRow({
	match,
	showScore = false,
	badges,
	children,
}: {
	match: TournamentMatchesLoaderMatch;
	showScore?: boolean;
	badges?: React.ReactNode;
	children?: React.ReactNode;
}) {
	const tournament = useTournament();

	return (
		<li
			className={clsx(styles.row, { [styles.ownRow]: match.isOwn })}
			data-testid={`set-row-${match.id}`}
		>
			<Link
				to={tournamentMatchPage({
					tournamentId: tournament.ctx.id,
					matchId: match.id,
				})}
				className={styles.rowLink}
			>
				<span className={styles.round}>
					{tournament.leagueDivisions.length > 1 && !showScore
						? `${match.bracketName} · `
						: null}
					{match.roundName}
				</span>
				<span className={styles.badges}>{badges}</span>
				<span className={styles.teams}>
					{match.teams.map((team, index) => (
						<span
							key={team.id}
							className={clsx(styles.team, {
								[styles.loser]: showScore && match.winnerTeamId !== team.id,
							})}
						>
							{index === 1 ? <span className={styles.vs}>vs.</span> : null}
							<Avatar
								size="xxs"
								url={team.logoUrl ?? undefined}
								identiconInput={team.name}
							/>
							<span className={styles.teamName}>{team.name}</span>
							{showScore ? (
								<span className={styles.score}>{team.score}</span>
							) : null}
						</span>
					))}
				</span>
				<span className={styles.meta}>{children}</span>
			</Link>
		</li>
	);
}

function SetBadges({ match }: { match: TournamentMatchesLoaderMatch }) {
	const { t } = useTranslation(["tournament"]);

	return (
		<>
			{match.isLive ? (
				<span
					className={clsx(styles.badge, styles.liveBadge)}
					data-testid="live-badge"
				>
					{t("tournament:matches.live")}
				</span>
			) : null}
			{match.isCasted ? (
				<span className={styles.badge} data-testid="cast-badge">
					<Tv size={12} /> {t("tournament:matches.cast")}
				</span>
			) : null}
		</>
	);
}

function EmptyState({ children }: { children: React.ReactNode }) {
	return (
		<div className="text-center text-lighter font-semi-bold py-4">
			{children}
		</div>
	);
}
