import clsx from "clsx";
import { Users } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link, useLoaderData, useMatches } from "react-router";
import { Avatar } from "~/components/Avatar";
import { EmptyState } from "~/components/EmptyState";
import { WeaponImage } from "~/components/Image";
import { LocaleTime } from "~/components/LocaleTime";
import { Pagination } from "~/components/Pagination";
import { SpDelta } from "~/components/SpDelta";
import type {
	SeasonGroupMatch,
	SeasonTournamentResult,
} from "~/features/sendouq-match/SQMatchRepository.server";
import { useSearchParamPagination } from "~/hooks/useSearchParamPagination";
import { databaseTimestampToDate } from "~/utils/dates";
import invariant from "~/utils/invariant";
import { roundToNDecimalPlaces } from "~/utils/number";
import { sendouQMatchPage, tournamentTeamPage } from "~/utils/urls";
import {
	loader,
	type UserSeasonsSetsLoaderData,
} from "../loaders/u.$identifier.seasons.index.server";
import type { UserPageLoaderData } from "../loaders/u.$identifier.server";
import { userSeasonsSearchParams } from "../user-page-search-params";
import styles from "./u.$identifier.seasons.index.module.css";

export { loader };

export const shouldRevalidate = userSeasonsSearchParams.shouldRevalidate;

export default function UserSeasonsSets() {
	const { t } = useTranslation(["user"]);
	const data = useLoaderData<typeof loader>();

	if (!data) return null;

	if (data.results.value.length === 0) {
		return <EmptyState navItem="sendouq">{t("user:seasons.noQ")}</EmptyState>;
	}

	return <Results results={data.results} />;
}

function Results({
	results,
}: {
	results: UserSeasonsSetsLoaderData["results"];
}) {
	const ref = React.useRef<HTMLDivElement>(null);

	const pagination = useSearchParamPagination({
		definition: userSeasonsSearchParams,
		currentPage: results.currentPage,
		pagesCount: results.pagesCount,
	});

	React.useEffect(() => {
		if (results.currentPage === 1) return;
		ref.current?.scrollIntoView({
			block: "center",
		});
	}, [results.currentPage]);

	let lastDayRendered: number | null = null;
	return (
		<div>
			<div ref={ref} />
			<div className="stack lg">
				<div className="stack">
					{results.value.map((result) => {
						const day = databaseTimestampToDate(result.createdAt).getDate();
						const shouldRenderDateHeader = day !== lastDayRendered;
						lastDayRendered = day;

						return (
							<React.Fragment key={result.id}>
								<LocaleTime
									date={result.createdAt}
									options={{
										weekday: "long",
										month: "numeric",
										day: "numeric",
									}}
									className={clsx(
										"text-xs font-semi-bold text-theme-secondary",
										{
											invisible: !shouldRenderDateHeader,
										},
									)}
								/>
								{result.type === "GROUP_MATCH" ? (
									<GroupMatchResult match={result.groupMatch} />
								) : (
									<TournamentResult result={result.tournamentResult} />
								)}
							</React.Fragment>
						);
					})}
				</div>
				{results.pagesCount > 1 ? <Pagination {...pagination} /> : null}
			</div>
		</div>
	);
}

function GroupMatchResult({ match }: { match: SeasonGroupMatch }) {
	const [, parentRoute] = useMatches();
	invariant(parentRoute);
	const layoutData = parentRoute.loaderData as UserPageLoaderData;
	const userId = layoutData.user.id;

	// score when match has not yet been played or was canceled
	const specialScoreMarking = () => {
		if (match.score[0] + match.score[1] === 0) return " ";

		return null;
	};

	const reserveWeaponSpace =
		match.groupAlphaMembers.some((m) => m.weaponSplId) ||
		match.groupBravoMembers.some((m) => m.weaponSplId);

	// make sure user's team is always on the top
	const rows = match.groupAlphaMembers.some((m) => m.id === userId)
		? [
				<MatchMembersRow
					key="alpha"
					members={match.groupAlphaMembers}
					score={specialScoreMarking() ?? match.score[0]}
					reserveWeaponSpace={reserveWeaponSpace}
				/>,
				<MatchMembersRow
					key="bravo"
					members={match.groupBravoMembers}
					score={specialScoreMarking() ?? match.score[1]}
					reserveWeaponSpace={reserveWeaponSpace}
				/>,
			]
		: [
				<MatchMembersRow
					key="bravo"
					members={match.groupBravoMembers}
					score={specialScoreMarking() ?? match.score[1]}
					reserveWeaponSpace={reserveWeaponSpace}
				/>,
				<MatchMembersRow
					key="alpha"
					members={match.groupAlphaMembers}
					score={specialScoreMarking() ?? match.score[0]}
					reserveWeaponSpace={reserveWeaponSpace}
				/>,
			];

	return (
		<div>
			<Link
				to={sendouQMatchPage(match.id)}
				className={clsx(styles.seasonMatch, {
					[styles.seasonMatchWithSubSection]: match.spDiff,
				})}
			>
				{rows}
			</Link>
			{match.spDiff ? (
				<div className={styles.seasonMatchSubSection}>
					<SpDiff spDiff={match.spDiff} />
				</div>
			) : null}
		</div>
	);
}

function TournamentResult({ result }: { result: SeasonTournamentResult }) {
	const hasSubSection = Boolean(result.spDiff) || result.teamSp !== null;

	return (
		<div data-testid="seasons-tournament-result">
			<Link
				to={tournamentTeamPage(result)}
				className={clsx(styles.seasonMatch, {
					[styles.seasonMatchWithSubSection]: hasSubSection,
				})}
			>
				<div className="stack sm font-bold items-center text-lg text-center">
					<img
						src={result.logoUrl}
						width={36}
						height={36}
						alt=""
						className="rounded-full"
					/>
					{result.tournamentName}
				</div>
				<ul className={styles.seasonMatchSetResults}>
					{result.setResults.filter(Boolean).map((result, i) => (
						<li key={i} data-is-win={String(result === "W")}>
							{result}
						</li>
					))}
				</ul>
			</Link>
			{hasSubSection ? (
				<div className={styles.seasonMatchSubSection}>
					{result.spDiff ? <SpDiff spDiff={result.spDiff} /> : null}
					{result.teamSp !== null ? (
						<div className="stack horizontal xxs items-center text-lighter">
							<Users size={14} />
							{result.teamSpDiff !== null ? (
								<SpDiff spDiff={result.teamSpDiff} />
							) : (
								<>◆ {roundToNDecimalPlaces(result.teamSp)}SP</>
							)}
						</div>
					) : null}
				</div>
			) : null}
		</div>
	);
}

function SpDiff({ spDiff }: { spDiff: number }) {
	return (
		<div className="stack horizontal xxs items-center">
			<SpDelta diff={spDiff} />
		</div>
	);
}

function MatchMembersRow({
	score,
	members,
	reserveWeaponSpace,
}: {
	score: React.ReactNode;
	members: SeasonGroupMatch["groupAlphaMembers"];
	reserveWeaponSpace: boolean;
}) {
	return (
		<div className="stack horizontal xs items-center">
			{members.map((member) => {
				return (
					<div key={member.discordId} className={styles.seasonMatchUser}>
						<Avatar user={member} size="xxs" />
						<span className={styles.seasonMatchUserName}>
							{member.username}
						</span>
						{typeof member.weaponSplId === "number" ? (
							<WeaponImage
								weaponSplId={member.weaponSplId}
								variant="badge"
								size={28}
							/>
						) : reserveWeaponSpace ? (
							<WeaponImage
								weaponSplId={0}
								variant="badge"
								size={28}
								className="invisible"
							/>
						) : null}
					</div>
				);
			})}
			<div className={styles.seasonMatchScore}>{score}</div>
		</div>
	);
}
