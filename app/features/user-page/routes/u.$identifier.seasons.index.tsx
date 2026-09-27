import clsx from "clsx";
import { Gauge, Users } from "lucide-react";
import * as React from "react";
import { Trans, useTranslation } from "react-i18next";
import { Link, useLoaderData } from "react-router";
import { Avatar } from "~/components/Avatar";
import { EmptyState } from "~/components/EmptyState";
import {
	SendouChipRadio,
	SendouChipRadioGroup,
} from "~/components/elements/ChipRadio";
import { Image, TierImage } from "~/components/Image";
import { LocaleTime } from "~/components/LocaleTime";
import { Pagination } from "~/components/Pagination";
import { Placement } from "~/components/Placement";
import { SpDelta } from "~/components/SpDelta";
import type {
	SeasonGroupMatch,
	SeasonTournamentResult,
} from "~/features/sendouq-match/SQMatchRepository.server";
import { useSearchParamPagination } from "~/hooks/useSearchParamPagination";
import { useSearchParam } from "~/modules/search-params/hooks";
import { roundToNDecimalPlaces } from "~/utils/number";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { navIconUrl, sendouQMatchPage, tournamentTeamPage } from "~/utils/urls";
import {
	loader,
	type UserSeasonResultsLoaderData,
} from "../loaders/u.$identifier.seasons.index.server";
import {
	SEASON_RESULT_SOURCES,
	type SeasonResultSource,
} from "../user-page-constants";
import { useUserPageLayoutData } from "../user-page-hooks";
import { userSeasonResultsSearchParams } from "../user-page-search-params";
import styles from "./u.$identifier.seasons.index.module.css";

export { loader };

export const handle: SendouRouteHandle = {
	i18n: ["user"],
};

export const shouldRevalidate = userSeasonResultsSearchParams.shouldRevalidate;

export default function UserSeasonResultsPage() {
	const { t } = useTranslation(["user"]);
	const results = useLoaderData<typeof loader>();
	const [source, setSource] = useSearchParam(
		userSeasonResultsSearchParams,
		"source",
	);
	const sectionRef = React.useRef<HTMLElement>(null);

	if (!results) return null;

	return (
		<section ref={sectionRef} className="stack md">
			<div className="stack horizontal md items-center justify-between flex-wrap">
				<h2 className={styles.subHeading}>{t("user:seasons.history")}</h2>
				<SendouChipRadioGroup>
					{SEASON_RESULT_SOURCES.map((value) => (
						<SendouChipRadio
							key={value}
							name="source"
							value={value}
							checked={source === value}
							onChange={(newValue) => setSource(newValue as SeasonResultSource)}
						>
							{t(`user:seasons.source.${value}`)}
						</SendouChipRadio>
					))}
				</SendouChipRadioGroup>
			</div>
			{results.days.length === 0 ? (
				<EmptyState navItem="sendouq">{t("user:seasons.noQ")}</EmptyState>
			) : (
				<Results results={results} scrollTargetRef={sectionRef} />
			)}
		</section>
	);
}

type SeasonResultsDay = UserSeasonResultsLoaderData["days"][number];

function Results({
	results,
	scrollTargetRef,
}: {
	results: UserSeasonResultsLoaderData;
	scrollTargetRef: React.RefObject<HTMLElement | null>;
}) {
	const layoutData = useUserPageLayoutData();

	const pagination = useSearchParamPagination({
		definition: userSeasonResultsSearchParams,
		currentPage: results.currentPage,
		pagesCount: results.pagesCount,
		scrollTargetRef,
	});

	return (
		<div className="stack lg">
			<div className={styles.days}>
				{results.days.map((day) => (
					<div key={day.summary.date} className="stack sm">
						<DayHeader summary={day.summary} />
						{day.results.map((result) =>
							result.type === "GROUP_MATCH" ? (
								<GroupMatchResult
									key={result.id}
									match={result.groupMatch}
									createdAt={result.createdAt}
									userId={layoutData.user.id}
								/>
							) : (
								<TournamentResult
									key={result.id}
									result={result.tournamentResult}
								/>
							),
						)}
					</div>
				))}
			</div>
			{results.pagesCount > 1 ? <Pagination {...pagination} /> : null}
		</div>
	);
}

function DayHeader({ summary }: { summary: SeasonResultsDay["summary"] }) {
	const { t } = useTranslation(["user"]);

	return (
		<div className={styles.dayHeader}>
			<LocaleTime
				date={new Date(summary.date)}
				options={{
					weekday: "long",
					month: "short",
					day: "numeric",
					timeZone: "UTC",
				}}
				className="text-sm font-semi-bold"
			/>
			<span className="stack horizontal xs items-center text-xs text-lighter">
				{summary.setsCount > 0 ? (
					<DayHeaderCount
						icon="sendouq"
						label={t("user:seasons.summary.count.sets", {
							count: summary.setsCount,
						})}
					>
						{summary.setWins}–{summary.setLosses}
					</DayHeaderCount>
				) : null}
				{summary.tournamentsCount > 0 ? (
					<>
						{summary.setsCount > 0 ? <span>·</span> : null}
						<DayHeaderCount
							icon="medal"
							label={t("user:seasons.summary.count.tournaments", {
								count: summary.tournamentsCount,
							})}
						>
							{summary.tournamentsCount}
						</DayHeaderCount>
					</>
				) : null}
				{typeof summary.spDiff === "number" ? (
					<>
						<span>·</span>
						<SpDelta diff={summary.spDiff} />
					</>
				) : null}
			</span>
			<span className={styles.dayHeaderLine} />
		</div>
	);
}

function DayHeaderCount({
	icon,
	label,
	children,
}: {
	icon: "sendouq" | "medal";
	label: string;
	children: React.ReactNode;
}) {
	return (
		<span className="stack horizontal xxs items-center" title={label}>
			<Image path={navIconUrl(icon)} alt={label} size={16} />
			{children}
		</span>
	);
}

function groupMatchOutcome(match: SeasonGroupMatch, userId: number) {
	const isAlpha = match.groupAlphaMembers.some((m) => m.id === userId);
	const [alphaScore, bravoScore] = match.score;
	if (alphaScore === bravoScore) return null;

	return alphaScore > bravoScore === isAlpha ? "W" : "L";
}

function GroupMatchResult({
	match,
	createdAt,
	userId,
}: {
	match: SeasonGroupMatch;
	createdAt: number;
	userId: number;
}) {
	const { t } = useTranslation(["user"]);

	const isAlpha = match.groupAlphaMembers.some((m) => m.id === userId);
	const [ownScore, opponentScore] = isAlpha
		? match.score
		: [match.score[1], match.score[0]];
	const [ownTier, opponentTier] = isAlpha
		? [match.alphaTier, match.bravoTier]
		: [match.bravoTier, match.alphaTier];
	const outcome = groupMatchOutcome(match, userId);

	return (
		<Link to={sendouQMatchPage(match.id)} className={styles.result}>
			<div className={styles.outcome} data-outcome={outcome ?? undefined}>
				{outcome
					? t(
							outcome === "W"
								? "user:seasons.win.short"
								: "user:seasons.loss.short",
						)
					: "–"}
			</div>
			<div className={styles.resultInfo}>
				<span className={clsx(styles.resultTitle, "text-sm font-semi-bold")}>
					SendouQ · {ownScore}–{opponentScore} ·{" "}
					<span className="whitespace-nowrap">
						<LocaleTime
							date={createdAt}
							options={{ hour: "numeric", minute: "numeric" }}
							inline
						/>
					</span>
				</span>
				{ownTier && opponentTier ? (
					<span
						className={clsx(
							styles.resultSubtitle,
							"stack horizontal xs items-center text-xs text-lighter",
						)}
					>
						<GroupTier tier={ownTier} />
						{t("user:seasons.vs")}
						<GroupTier tier={opponentTier} />
					</span>
				) : null}
			</div>
			<div className={styles.players}>
				<MatchMembers
					members={isAlpha ? match.groupAlphaMembers : match.groupBravoMembers}
				/>
				<span className="text-xs text-lighter">{t("user:seasons.vs")}</span>
				<MatchMembers
					members={isAlpha ? match.groupBravoMembers : match.groupAlphaMembers}
				/>
			</div>
			<div className={styles.sp}>
				{typeof match.spDiff === "number" ? (
					<SpDelta diff={match.spDiff} />
				) : null}
			</div>
		</Link>
	);
}

function GroupTier({
	tier,
}: {
	tier: NonNullable<SeasonGroupMatch["alphaTier"]>;
}) {
	return (
		<span className={styles.tierTile}>
			<TierImage tier={tier} width={28} />
		</span>
	);
}

function MatchMembers({
	members,
}: {
	members: Array<SeasonTournamentResult["teamMembers"][number]>;
}) {
	return (
		<div className={styles.members}>
			{members.map((member) => (
				<Avatar
					key={member.discordId}
					user={member}
					size="xxsm"
					alt={member.username}
				/>
			))}
		</div>
	);
}

function TournamentResult({ result }: { result: SeasonTournamentResult }) {
	const { t } = useTranslation(["user"]);

	const setWins = result.setResults.filter((r) => r === "W").length;
	const setLosses = result.setResults.filter((r) => r === "L").length;

	return (
		<Link
			to={tournamentTeamPage(result)}
			className={styles.result}
			data-testid="seasons-tournament-result"
		>
			<div className={styles.outcome} data-outcome="tournament">
				<Placement placement={result.placement} size={28} />
			</div>
			<div className={styles.resultInfo}>
				<span
					className={clsx(
						styles.resultTitle,
						"stack horizontal sm items-center text-sm font-semi-bold",
					)}
				>
					<img
						src={result.logoUrl}
						width={24}
						height={24}
						alt=""
						className="rounded-full"
					/>
					{result.tournamentName}
				</span>
				<span className={clsx(styles.resultSubtitle, "text-xs text-lighter")}>
					<Trans
						t={t}
						i18nKey="user:seasons.placementOfTeams"
						values={{ count: result.participantCount }}
						components={[
							<Placement
								key="placement"
								placement={result.placement}
								textOnly
								showAsSuperscript={false}
							/>,
						]}
					/>{" "}
					· {setWins}–{setLosses}
				</span>
			</div>
			<div className={styles.players}>
				<MatchMembers members={result.teamMembers} />
			</div>
			<div className={clsx(styles.sp, "stack xxs items-end")}>
				{result.spDiff ? (
					<span className="stack horizontal xxs items-center">
						<SpDelta diff={result.spDiff} />
					</span>
				) : null}
				{result.teamSp !== null ? (
					<span className="stack horizontal xxs items-center text-xs text-lighter">
						<Users size={14} />
						{result.teamSpDiff !== null ? (
							<SpDelta diff={result.teamSpDiff} />
						) : (
							<>
								<Gauge size={14} />
								{roundToNDecimalPlaces(result.teamSp)}SP
							</>
						)}
					</span>
				) : null}
			</div>
		</Link>
	);
}
