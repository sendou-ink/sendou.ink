import type { MetaFunction, SerializeFrom } from "@remix-run/node";
import { Link, useLoaderData, useSearchParams } from "@remix-run/react";
import React from "react";
import { useTranslation } from "react-i18next";
import { Avatar } from "~/components/Avatar";
import { TierImage, WeaponImage } from "~/components/Image";
import { Main } from "~/components/Main";
import * as Seasons from "~/features/mmr/core/Seasons";
import { ordinalToSp } from "~/features/mmr/mmr-utils";
import type { SkillTierInterval } from "~/features/mmr/tiered.server";
import { rankedModesShort } from "~/modules/in-game-lists/modes";
import { weaponCategories } from "~/modules/in-game-lists/weapon-ids";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import {
	LEADERBOARDS_PAGE,
	navIconUrl,
	teamPage,
	topSearchPlayerPage,
	userPage,
	userSeasonsPage,
	userSubmittedImage,
} from "~/utils/urls";
import { InfoPopover } from "../../../components/InfoPopover";
import { TopTenPlayer } from "../components/TopTenPlayer";
import {
	LEADERBOARD_TYPES,
	SEASON_SEARCH_PARAM_KEY,
	TYPE_SEARCH_PARAM_KEY,
} from "../leaderboards-constants";
import { seasonHasTopTen } from "../leaderboards-utils";
import type { XPLeaderboardItem } from "../queries/XPLeaderboard.server";

import { loader } from "../loaders/leaderboards.server";
export { loader };

import "../../top-search/top-search.css";

export const handle: SendouRouteHandle = {
	i18n: ["vods"],
	breadcrumb: () => ({
		imgPath: navIconUrl("leaderboards"),
		href: LEADERBOARDS_PAGE,
		type: "IMAGE",
	}),
};

export const meta: MetaFunction = (args) => {
	const data = args.data as SerializeFrom<typeof loader> | null;

	if (!data) return [];

	return metaTags({
		title: "Leaderboards",
		ogTitle: "Splatoon leaderboards",
		description:
			"Leaderboards of top Splatoon players ranked by their X Battle placements as well as tournament and SendouQ results. Categories per weapon and mode.",
		location: args.location,
	});
};

export default function LeaderboardsPage() {
	const { t } = useTranslation(["common", "game-misc", "weapons"]);
	const [searchParams, setSearchParams] = useSearchParams();
	const data = useLoaderData<typeof loader>();

	const isAllUserLeaderboard =
		!searchParams.get(TYPE_SEARCH_PARAM_KEY) ||
		searchParams.get(TYPE_SEARCH_PARAM_KEY) === "USER";

	const seasonPlusTypeToKey = ({
		season,
		type,
	}: {
		season: number;
		type: string;
	}) => `${type};${season}`;

	const selectValue = () => {
		const type =
			searchParams.get(TYPE_SEARCH_PARAM_KEY) ?? LEADERBOARD_TYPES[0];

		if (
			LEADERBOARD_TYPES.includes(type as (typeof LEADERBOARD_TYPES)[number])
		) {
			return seasonPlusTypeToKey({
				season: data.season,
				type,
			});
		}

		return type;
	};

	const showTopTen = Boolean(
		seasonHasTopTen(data.season) &&
			isAllUserLeaderboard &&
			data.userLeaderboard,
	);

	const renderNoEntries =
		(data.userLeaderboard && data.userLeaderboard.length === 0) ||
		(data.teamLeaderboard && data.teamLeaderboard.length === 0);

	return (
		<Main halfWidth className="stack lg">
			<select
				className="text-sm"
				value={selectValue()}
				onChange={(e) => {
					const [type, season] = e.target.value.split(";");
					setSearchParams({
						[TYPE_SEARCH_PARAM_KEY]: type,
						[SEASON_SEARCH_PARAM_KEY]: season,
					});
				}}
			>
				{Seasons.allStarted().map((season) => {
					return (
						<optgroup label={`SP - Season ${season}`} key={season}>
							{LEADERBOARD_TYPES.filter((type) => !type.includes("XP")).map(
								(type) => {
									const userOrTeam = type.includes("USER") ? "USER" : "TEAM";
									const category = weaponCategories.find((c) =>
										type.includes(c.name),
									)?.name;

									return (
										<option
											key={type}
											value={seasonPlusTypeToKey({ season, type })}
										>
											{t(`common:leaderboard.type.${userOrTeam}`)}
											{type.includes("ALL")
												? ` (${t("leaderboard.type.XP-ALL")})`
												: null}
											{category
												? ` (${t(`common:weapon.category.${category}`)})`
												: ""}
										</option>
									);
								},
							)}
						</optgroup>
					);
				})}
				<optgroup label="XP">
					<option value="XP-ALL">{t("common:leaderboard.type.XP-ALL")}</option>
					{rankedModesShort.map((mode) => {
						return (
							<option key={mode} value={`XP-MODE-${mode}`}>
								{t(`game-misc:MODE_LONG_${mode}`)}
							</option>
						);
					})}
				</optgroup>
				{weaponCategories.map((category) => {
					return (
						<optgroup
							key={category.name}
							label={`XP (${t(`common:weapon.category.${category.name}`)})`}
						>
							{category.weaponIds.map((weaponId) => {
								return (
									<option key={weaponId} value={`XP-WEAPON-${weaponId}`}>
										{t(`weapons:MAIN_${weaponId}`)}
									</option>
								);
							})}
						</optgroup>
					);
				})}
			</select>
			{showTopTen ? (
				<div className="stack lg mx-auto">
					{data
						.userLeaderboard!.filter((_, i) => i <= 9)
						.map((entry, i) => {
							return (
								<Link
									key={`${entry.id}-${data.season}`}
									to={userSeasonsPage({ user: entry, season: data.season })}
								>
									<TopTenPlayer
										placement={i + 1}
										power={entry.power}
										season={data.season}
									/>
								</Link>
							);
						})}
				</div>
			) : null}

			{data.ownEntryPeek ? (
				<OwnEntryPeek
					entry={data.ownEntryPeek.entry}
					nextTier={data.ownEntryPeek.nextTier}
				/>
			) : null}

			{data.userLeaderboard ? (
				<PlayersTable
					entries={data.userLeaderboard}
					showTiers={isAllUserLeaderboard}
					showingTopTen={showTopTen}
				/>
			) : null}
			{data.teamLeaderboard ? (
				<TeamTable
					entries={data.teamLeaderboard}
					showQualificationDividers={!selectValue().includes("ALL")}
				/>
			) : null}
			{data.xpLeaderboard ? <XPTable entries={data.xpLeaderboard} /> : null}

			{renderNoEntries ? (
				<div className="text-center text-lg text-lighter">
					{data.userLeaderboard
						? t("common:leaderboard.noPlayers")
						: t("common:leaderboard.noTeams")}
				</div>
			) : null}

			{!data.xpLeaderboard && data.season === Seasons.current()?.nth ? (
				<div className="text-xs text-lighter text-center">
					{t("common:leaderboard.updateInfo")}
				</div>
			) : null}
		</Main>
	);
}

function OwnEntryPeek({
	entry,
	nextTier,
}: {
	entry: NonNullable<SerializeFrom<typeof loader>["ownEntryPeek"]>["entry"];
	nextTier?: SkillTierInterval;
}) {
	const data = useLoaderData<typeof loader>();

	return (
		<div>
			{entry.firstOfTier ? (
				<div className="placements__tier-header">
					<TierImage tier={entry.firstOfTier} width={32} />
					{entry.firstOfTier.name}
					{entry.firstOfTier.isPlus ? "+" : ""}
				</div>
			) : null}
			<div>
				<Link
					to={userSeasonsPage({ user: entry, season: data.season })}
					className="placements__table__row"
				>
					<div className="placements__table__inner-row">
						<div className="placements__table__rank">{entry.placementRank}</div>
						<div>
							<Avatar size="xxs" user={entry} />
						</div>
						{typeof entry.weaponSplId === "number" ? (
							<WeaponImage
								className="placements__table__weapon"
								variant="build"
								weaponSplId={entry.weaponSplId}
								width={32}
								height={32}
							/>
						) : null}
						<div className="placements__table__name">{entry.username}</div>
						<div className="placements__table__power">{entry.power}</div>
					</div>
				</Link>
			</div>
			{nextTier ? (
				<div className="text-xs text-lighter ml-auto stack items-end">
					{nextTier.name}
					{nextTier.isPlus ? "+" : ""} @ {ordinalToSp(nextTier.neededOrdinal!)}
					SP
				</div>
			) : null}
		</div>
	);
}

function PlayersTable({
	entries,
	showTiers,
	showingTopTen,
}: {
	entries: NonNullable<SerializeFrom<typeof loader>["userLeaderboard"]>;
	showTiers?: boolean;
	showingTopTen?: boolean;
}) {
	const data = useLoaderData<typeof loader>();

	return (
		<div className="placements__table">
			{entries
				// hide normal rows that are showed in "fancy" top 10 format
				.filter((_, i) => !showingTopTen || i > 9)
				.map((entry) => {
					return (
						<React.Fragment key={entry.entryId}>
							{entry.firstOfTier && showTiers ? (
								<div className="placements__tier-header">
									<TierImage tier={entry.firstOfTier} width={32} />
									{entry.firstOfTier.name}
									{entry.firstOfTier.isPlus ? "+" : ""}
								</div>
							) : null}
							<Link
								to={userSeasonsPage({ user: entry, season: data.season })}
								className="placements__table__row"
							>
								<div className="placements__table__inner-row">
									<div className="placements__table__rank">
										{entry.placementRank}
									</div>
									<div>
										<Avatar size="xxs" user={entry} />
									</div>
									{typeof entry.weaponSplId === "number" ? (
										<WeaponImage
											className="placements__table__weapon"
											variant="build"
											weaponSplId={entry.weaponSplId}
											width={32}
											height={32}
										/>
									) : null}
									<div className="placements__table__name">
										{entry.username}
									</div>
									{entry.pendingPlusTier ? (
										<div className="text-xs text-theme whitespace-nowrap">
											➜ +{entry.pendingPlusTier}
										</div>
									) : null}
									<div className="placements__table__power">
										{entry.power.toFixed(2)}
									</div>
								</div>
							</Link>
						</React.Fragment>
					);
				})}
		</div>
	);
}

function TeamTable({
	entries,
	showQualificationDividers: _showQualificationDividers,
}: {
	entries: NonNullable<SerializeFrom<typeof loader>["teamLeaderboard"]>;
	showQualificationDividers?: boolean;
}) {
	const { t } = useTranslation(["common"]);
	const data = useLoaderData<typeof loader>();
	const isCurrentSeason = data.season === Seasons.current()?.nth;
	const showQualificationDividers =
		_showQualificationDividers && isCurrentSeason && entries.length > 20;

	return (
		<div className="placements__table">
			{entries.map((entry, i) => {
				return (
					<React.Fragment key={entry.entryId}>
						<div className="placements__table__row">
							<div className="placements__table__inner-row">
								<div className="placements__table__rank">
									{entry.placementRank}
								</div>
								{entry.team?.avatarUrl ? (
									<Link
										// TODO: can be made better when $narrowNotNull lands
										to={teamPage(entry.team.customUrl!)}
										// TODO: can be made better when $narrowNotNull lands
										title={entry.team.name!}
									>
										<Avatar
											size="xxs"
											url={userSubmittedImage(entry.team.avatarUrl)}
											className="placements__avatar"
										/>
									</Link>
								) : null}
								<div className="text-xs">
									{entry.members.map((member, i) => {
										return (
											<React.Fragment key={member.id}>
												<Link to={userPage(member)}>{member.username}</Link>
												{i !== entry.members.length - 1 ? ", " : null}
											</React.Fragment>
										);
									})}
								</div>
								<div className="placements__table__power">
									{entry.power.toFixed(2)}
								</div>
							</div>
						</div>
						{i === 11 && showQualificationDividers ? (
							<div className="placements__table__row placements__table__row__qualification">
								{t("common:leaderboard.qualification")}
								<InfoPopover tiny>
									{t("common:leaderboard.qualification.info")}
								</InfoPopover>
							</div>
						) : null}
					</React.Fragment>
				);
			})}
		</div>
	);
}

function XPTable({ entries }: { entries: XPLeaderboardItem[] }) {
	return (
		<div className="placements__table">
			{entries.map((entry) => {
				return (
					<Link
						to={topSearchPlayerPage(entry.playerId)}
						key={entry.entryId}
						className="placements__table__row"
					>
						<div className="placements__table__inner-row">
							<div className="placements__table__rank">
								{entry.placementRank}
							</div>
							{entry.discordId ? (
								<Avatar size="xxs" user={entry as any} />
							) : null}
							<WeaponImage
								className="placements__table__weapon"
								variant="build"
								weaponSplId={entry.weaponSplId}
								width={32}
								height={32}
							/>
							<div>{entry.name}</div>
							<div className="placements__table__power">
								{entry.power.toFixed(1)}
							</div>
						</div>
					</Link>
				);
			})}
		</div>
	);
}
