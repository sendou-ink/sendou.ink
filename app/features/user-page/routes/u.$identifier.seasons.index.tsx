import clsx from "clsx";
import * as React from "react";
import { useTranslation } from "react-i18next";
import {
	Link,
	type ShouldRevalidateFunction,
	useLoaderData,
	useMatches,
	useSearchParams,
} from "react-router";
import { Avatar } from "~/components/Avatar";
import { WeaponImage } from "~/components/Image";
import { LocaleTime } from "~/components/LocaleTime";
import { Pagination } from "~/components/Pagination";
import type {
	SeasonGroupMatch,
	SeasonTournamentResult,
} from "~/features/sendouq-match/SQMatchRepository.server";
import { databaseTimestampToDate } from "~/utils/dates";
import invariant from "~/utils/invariant";
import { roundToNDecimalPlaces } from "~/utils/number";
import { isRevalidation } from "~/utils/remix";
import { sendouQMatchPage, tournamentTeamPage } from "~/utils/urls";
import {
	loader,
	type UserSeasonsSetsLoaderData,
} from "../loaders/u.$identifier.seasons.index.server";
import type { UserPageLoaderData } from "../loaders/u.$identifier.server";
import styles from "../user-page.module.css";

export { loader };

export const shouldRevalidate: ShouldRevalidateFunction = (args) => {
	if (isRevalidation(args)) return args.defaultShouldRevalidate;
	if (args.formMethod === "POST") return args.defaultShouldRevalidate;
	if (args.currentParams.identifier !== args.nextParams.identifier) return true;

	return (
		args.currentUrl.searchParams.get("season") !==
			args.nextUrl.searchParams.get("season") ||
		args.currentUrl.searchParams.get("page") !==
			args.nextUrl.searchParams.get("page")
	);
};

export default function UserSeasonsSets() {
	const { t } = useTranslation(["user"]);
	const data = useLoaderData<typeof loader>();

	if (!data) return null;

	if (data.results.value.length === 0) {
		return (
			<div className="text-lg text-lighter font-semi-bold text-center mt-2">
				{t("user:seasons.noQ")}
			</div>
		);
	}

	return <Results results={data.results} seasonViewed={data.season} />;
}

function Results({
	seasonViewed,
	results,
}: {
	seasonViewed: number;
	results: UserSeasonsSetsLoaderData["results"];
}) {
	const [, setSearchParams] = useSearchParams();
	const ref = React.useRef<HTMLDivElement>(null);

	const setPage = (page: number) => {
		setSearchParams({ page: String(page), season: String(seasonViewed) });
	};

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
				{results.pages > 1 ? (
					<Pagination
						currentPage={results.currentPage}
						pagesCount={results.pages}
						nextPage={() => setPage(results.currentPage + 1)}
						previousPage={() => setPage(results.currentPage - 1)}
						setPage={(page) => setPage(page)}
					/>
				) : null}
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
					{match.spDiff > 0 ? (
						<span className="text-success">▲</span>
					) : (
						<span className="text-warning">▼</span>
					)}
					{Math.abs(roundToNDecimalPlaces(match.spDiff))}SP
				</div>
			) : null}
		</div>
	);
}

function TournamentResult({ result }: { result: SeasonTournamentResult }) {
	return (
		<div data-testid="seasons-tournament-result">
			<Link
				to={tournamentTeamPage(result)}
				className={clsx(styles.seasonMatch, {
					[styles.seasonMatchWithSubSection]: result.spDiff,
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
			{result.spDiff ? (
				<div className={styles.seasonMatchSubSection}>
					{result.spDiff > 0 ? (
						<span className="text-success">▲</span>
					) : (
						<span className="text-warning">▼</span>
					)}
					{Math.abs(roundToNDecimalPlaces(result.spDiff))}SP
				</div>
			) : null}
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
