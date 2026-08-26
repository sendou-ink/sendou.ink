import clsx from "clsx";
import { Ban, MoreHorizontal, RotateCcw } from "lucide-react";
import React from "react";
import { useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { Link, useLoaderData } from "react-router";
import { Avatar } from "~/components/Avatar";
import { EmptyState } from "~/components/EmptyState";
import { SendouButton } from "~/components/elements/Button";
import {
	SendouChipRadio,
	SendouChipRadioGroup,
} from "~/components/elements/ChipRadio";
import { SendouMenu, SendouMenuItem } from "~/components/elements/Menu";
import {
	SendouTab,
	SendouTabList,
	SendouTabPanel,
	SendouTabs,
} from "~/components/elements/Tabs";
import { Image, ModeImage, TierImage } from "~/components/Image";
import { Main } from "~/components/Main";
import { WeaponSelect } from "~/components/WeaponSelect";
import { SeasonSelect } from "~/features/mmr/components/SeasonSelect";
import * as Seasons from "~/features/mmr/core/Seasons";
import { ordinalToSp } from "~/features/mmr/mmr-utils";
import type { SkillTierInterval } from "~/features/mmr/tiered.server";
import { useActionSubmit } from "~/hooks/useActionSubmit";
import { rankedModesShort } from "~/modules/in-game-lists/modes";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { weaponCategories } from "~/modules/in-game-lists/weapon-ids";
import { useHasRole } from "~/modules/permissions/hooks";
import {
	useSearchParam,
	useSearchParamsTyped,
} from "~/modules/search-params/hooks";
import { metaTags, ogPageImage, type SerializeFrom } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import {
	LEADERBOARDS_PAGE,
	navIconUrl,
	teamPage,
	userPage,
	weaponCategoryUrl,
} from "~/utils/urls";
import { InfoPopover } from "../../../components/InfoPopover";
import { action } from "../actions/leaderboards.server";
import { TopTenPlayer } from "../components/TopTenPlayer";
import type { XPLeaderboardItem } from "../LeaderboardRepository.server";
import { TEAM_LEADERBOARD_QUALIFYING_COUNT } from "../leaderboards-constants";
import { leaderboardsActionSchema } from "../leaderboards-schemas";
import { leaderboardsSearchParams } from "../leaderboards-search-params";
import { seasonHasTopTen } from "../leaderboards-utils";
import { loader } from "../loaders/leaderboards.server";

export { action, loader };

import {
	RankTable,
	RankTableDividerRow,
	RankTableInnerRow,
	RankTableRank,
	RankTableRow,
	RankTableWeaponImage,
} from "~/components/RankTable";
import { topSearchPlayerPage } from "~/features/top-search/top-search-urls";
import { userSeasonsPage } from "~/features/user-page/user-page-urls";
import leaderboardsStyles from "./leaderboards.module.css";

export const handle: SendouRouteHandle = {
	i18n: ["vods"],
	breadcrumb: () => ({
		imgPath: navIconUrl("leaderboards"),
		href: LEADERBOARDS_PAGE,
		type: "IMAGE",
	}),
};

export const meta: MetaFunction = (args) => {
	const data = args.loaderData as SerializeFrom<typeof loader> | null;

	if (!data) return [];

	return metaTags({
		title: "Leaderboards",
		ogTitle: "Splatoon leaderboards",
		description:
			"Leaderboards of top Splatoon players ranked by their X Battle placements as well as tournament and SendouQ results. Categories per weapon and mode.",
		image: ogPageImage("leaderboards"),
		location: args.location,
	});
};

export default function LeaderboardsPage() {
	const { t } = useTranslation(["common"]);
	const [params, setParams] = useSearchParamsTyped(leaderboardsSearchParams);
	const data = useLoaderData<typeof loader>();

	const isAllUserLeaderboard = params.type === "USER";

	const selectedTab = params.type.startsWith("XP")
		? "XP"
		: params.type.startsWith("TEAM")
			? "TEAMS"
			: "PLAYERS";

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
			<SendouTabs
				selectedKey={selectedTab}
				onSelectionChange={(key) => {
					if (key === selectedTab) return;
					if (key === "PLAYERS") return setParams({ type: "USER" });
					if (key === "TEAMS") return setParams({ type: "TEAM" });
					setParams({ type: "XP-ALL", season: null });
				}}
			>
				<SendouTabList>
					<SendouTab
						id="PLAYERS"
						icon={<Image path={navIconUrl("sendouq")} alt="" width={16} />}
					>
						{t("common:leaderboard.tabs.players")}
					</SendouTab>
					<SendouTab
						id="TEAMS"
						icon={<Image path={navIconUrl("sendouq")} alt="" width={16} />}
					>
						{t("common:leaderboard.tabs.teams")}
					</SendouTab>
					<SendouTab
						id="XP"
						icon={<Image path={navIconUrl("xsearch")} alt="" width={16} />}
					>
						{t("common:leaderboard.tabs.xp")}
					</SendouTab>
				</SendouTabList>
				<SendouTabPanel id="PLAYERS">
					<div className="stack md">
						<LeaderboardSeasonSelect />
						<WeaponCategoryFilter />
					</div>
				</SendouTabPanel>
				<SendouTabPanel id="TEAMS">
					<div className="stack md">
						<LeaderboardSeasonSelect />
						<TeamScopeFilter />
					</div>
				</SendouTabPanel>
				<SendouTabPanel id="XP">
					<div className="stack md">
						<XPModeFilter />
						<XPWeaponSelect />
					</div>
				</SendouTabPanel>
			</SendouTabs>
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
					showQualificationDividers={params.type !== "TEAM-ALL"}
				/>
			) : null}
			{data.xpLeaderboard ? <XPTable entries={data.xpLeaderboard} /> : null}

			{renderNoEntries ? (
				<EmptyState navItem="leaderboards">
					{data.userLeaderboard
						? t("common:leaderboard.noPlayers")
						: t("common:leaderboard.noTeams")}
				</EmptyState>
			) : null}

			{!data.xpLeaderboard && data.season === Seasons.current()?.nth ? (
				<div className="text-xs text-lighter text-center">
					{t("common:leaderboard.updateInfo")}
				</div>
			) : null}
		</Main>
	);
}

function LeaderboardSeasonSelect() {
	const { t } = useTranslation(["common"]);
	const data = useLoaderData<typeof loader>();
	const [, setParams] = useSearchParamsTyped(leaderboardsSearchParams);

	return (
		<SeasonSelect
			label={t("common:leaderboard.season")}
			season={data.season}
			onChange={(season) => setParams({ season })}
		/>
	);
}

function WeaponCategoryFilter() {
	const { t } = useTranslation(["common"]);
	const [params, setParams] = useSearchParamsTyped(leaderboardsSearchParams);

	return (
		<SendouChipRadioGroup wrap>
			<SendouChipRadio
				name="weapon-category"
				value="ALL"
				checked={params.type === "USER"}
				onChange={() => setParams({ type: "USER" })}
			>
				{t("common:leaderboard.filter.all")}
			</SendouChipRadio>
			{weaponCategories.map((category) => (
				<SendouChipRadio
					key={category.name}
					name="weapon-category"
					value={category.name}
					checked={params.type === `USER-${category.name}`}
					onChange={() => setParams({ type: `USER-${category.name}` })}
				>
					<span className="stack horizontal xs items-center">
						<Image path={weaponCategoryUrl(category.name)} size={18} alt="" />
						{t(`common:weapon.category.${category.name}`)}
					</span>
				</SendouChipRadio>
			))}
		</SendouChipRadioGroup>
	);
}

function TeamScopeFilter() {
	const { t } = useTranslation(["common"]);
	const [params, setParams] = useSearchParamsTyped(leaderboardsSearchParams);

	return (
		<SendouChipRadioGroup>
			<SendouChipRadio
				name="team-scope"
				value="TEAM"
				checked={params.type === "TEAM"}
				onChange={() => setParams({ type: "TEAM" })}
			>
				{t("common:leaderboard.teams.best")}
			</SendouChipRadio>
			<SendouChipRadio
				name="team-scope"
				value="TEAM-ALL"
				checked={params.type === "TEAM-ALL"}
				onChange={() => setParams({ type: "TEAM-ALL" })}
			>
				{t("common:leaderboard.teams.all")}
			</SendouChipRadio>
		</SendouChipRadioGroup>
	);
}

function XPModeFilter() {
	const { t } = useTranslation(["common", "game-misc"]);
	const [params, setParams] = useSearchParamsTyped(leaderboardsSearchParams);

	return (
		<SendouChipRadioGroup wrap>
			<SendouChipRadio
				name="xp-mode"
				value="XP-ALL"
				checked={params.type === "XP-ALL"}
				onChange={() => setParams({ type: "XP-ALL" })}
			>
				{t("common:leaderboard.filter.allModes")}
			</SendouChipRadio>
			{rankedModesShort.map((mode) => (
				<SendouChipRadio
					key={mode}
					name="xp-mode"
					value={`XP-MODE-${mode}`}
					checked={params.type === `XP-MODE-${mode}`}
					onChange={() => setParams({ type: `XP-MODE-${mode}` })}
				>
					<span className="stack horizontal xs items-center">
						<ModeImage mode={mode} size={18} />
						{t(`game-misc:MODE_LONG_${mode}`)}
					</span>
				</SendouChipRadio>
			))}
		</SendouChipRadioGroup>
	);
}

function XPWeaponSelect() {
	const [params, setParams] = useSearchParamsTyped(leaderboardsSearchParams);

	const selectedWeaponId = params.type.startsWith("XP-WEAPON")
		? (Number(params.type.split("-")[2]) as MainWeaponId)
		: null;

	return (
		<WeaponSelect
			clearable
			value={selectedWeaponId}
			onChange={(weaponId) =>
				setParams({
					type: weaponId === null ? "XP-ALL" : `XP-WEAPON-${weaponId}`,
				})
			}
		/>
	);
}

function OwnEntryPeek({
	entry,
	nextTier,
}: {
	entry: NonNullable<SerializeFrom<typeof loader>["userLeaderboard"]>[number];
	nextTier?: SkillTierInterval;
}) {
	const data = useLoaderData<typeof loader>();

	return (
		<div>
			{entry.firstOfTier ? (
				<div className={leaderboardsStyles.tierHeader}>
					<TierImage tier={entry.firstOfTier} width={32} />
					{entry.firstOfTier.name}
					{entry.firstOfTier.isPlus ? "+" : ""}
				</div>
			) : null}
			<div>
				<RankTableRow
					to={userSeasonsPage({ user: entry, season: data.season })}
				>
					<RankTableInnerRow>
						<RankTableRank>{entry.placementRank}</RankTableRank>
						<div>
							<Avatar size="xxs" user={entry} />
						</div>
						{typeof entry.weaponSplId === "number" ? (
							<RankTableWeaponImage weaponSplId={entry.weaponSplId} />
						) : null}
						<div className={leaderboardsStyles.tableName}>{entry.username}</div>
						<div className={leaderboardsStyles.tablePower}>{entry.power}</div>
					</RankTableInnerRow>
				</RankTableRow>
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
		<RankTable>
			{entries
				// hide normal rows that are showed in "fancy" top 10 format
				.filter((_, i) => !showingTopTen || i > 9)
				.map((entry) => {
					return (
						<React.Fragment key={entry.entryId}>
							{entry.firstOfTier && showTiers ? (
								<div className={leaderboardsStyles.tierHeader}>
									<TierImage tier={entry.firstOfTier} width={32} />
									{entry.firstOfTier.name}
									{entry.firstOfTier.isPlus ? "+" : ""}
								</div>
							) : null}
							<RankTableRow
								to={userSeasonsPage({ user: entry, season: data.season })}
							>
								<RankTableInnerRow>
									<RankTableRank>{entry.placementRank}</RankTableRank>
									<div>
										<Avatar size="xxs" user={entry} />
									</div>
									{typeof entry.weaponSplId === "number" ? (
										<RankTableWeaponImage weaponSplId={entry.weaponSplId} />
									) : null}
									<div className={leaderboardsStyles.tableName}>
										{entry.username}
									</div>
									{entry.pendingPlusTier ? (
										<div className="text-xs text-theme whitespace-nowrap">
											➜ +{entry.pendingPlusTier}
										</div>
									) : null}
									<div className={leaderboardsStyles.tablePower}>
										{entry.power.toFixed(2)}
									</div>
								</RankTableInnerRow>
							</RankTableRow>
						</React.Fragment>
					);
				})}
		</RankTable>
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
	const [type] = useSearchParam(leaderboardsSearchParams, "type");
	const isStaff = useHasRole("STAFF");
	const showStaffActions = isStaff && type !== "TEAM-ALL";
	const isCurrentSeason = data.season === Seasons.current()?.nth;
	const showQualificationDividers =
		_showQualificationDividers && isCurrentSeason && entries.length > 20;

	return (
		<RankTable>
			{entries.map((entry) => {
				return (
					<React.Fragment key={entry.entryId}>
						<RankTableRow>
							<RankTableInnerRow>
								<RankTableRank>{entry.placementRank}</RankTableRank>
								{entry.team?.avatarUrl ? (
									<Link
										to={teamPage(entry.team.customUrl)}
										title={entry.team.name}
									>
										<Avatar
											size="xxs"
											url={entry.team.avatarUrl}
											className={leaderboardsStyles.avatar}
										/>
									</Link>
								) : null}
								<div
									className={clsx("text-xs", {
										[leaderboardsStyles.skippedTeam]: entry.isSkipped,
									})}
								>
									{entry.members.map((member, i) => {
										return (
											<React.Fragment key={member.id}>
												<Link to={userPage(member)}>{member.username}</Link>
												{i !== entry.members.length - 1 ? ", " : null}
											</React.Fragment>
										);
									})}
								</div>
								<div className={leaderboardsStyles.tablePower}>
									{entry.power.toFixed(2)}
								</div>
								{showStaffActions ? <TeamStaffMenu entry={entry} /> : null}
							</RankTableInnerRow>
						</RankTableRow>
						{entry.placementRank === TEAM_LEADERBOARD_QUALIFYING_COUNT &&
						showQualificationDividers ? (
							<RankTableDividerRow>
								{t("common:leaderboard.qualification")}
								<InfoPopover tiny>
									{t("common:leaderboard.qualification.info")}
								</InfoPopover>
							</RankTableDividerRow>
						) : null}
					</React.Fragment>
				);
			})}
		</RankTable>
	);
}

function TeamStaffMenu({
	entry,
}: {
	entry: NonNullable<SerializeFrom<typeof loader>["teamLeaderboard"]>[number];
}) {
	const data = useLoaderData<typeof loader>();
	const { submit } = useActionSubmit(leaderboardsActionSchema, {
		encType: "application/json",
	});

	const fields = { season: data.season, identifier: entry.identifier };

	return (
		<SendouMenu
			trigger={
				<SendouButton
					size="miniscule"
					variant="outlined"
					icon={<MoreHorizontal />}
					aria-label="Actions"
				/>
			}
		>
			{entry.isSkipped ? (
				<SendouMenuItem
					icon={<RotateCcw />}
					onAction={() => submit("UNSKIP_TEAM", fields)}
				>
					Unskip
				</SendouMenuItem>
			) : (
				<SendouMenuItem
					icon={<Ban />}
					isDestructive
					onAction={() => submit("SKIP_TEAM", fields)}
				>
					Skip
				</SendouMenuItem>
			)}
		</SendouMenu>
	);
}

function XPTable({ entries }: { entries: XPLeaderboardItem[] }) {
	return (
		<RankTable>
			{entries.map((entry) => {
				return (
					<RankTableRow
						to={topSearchPlayerPage(entry.playerId)}
						key={entry.entryId}
					>
						<RankTableInnerRow>
							<RankTableRank>{entry.placementRank}</RankTableRank>
							{entry.discordId ? (
								<Avatar size="xxs" user={entry as any} />
							) : null}
							<RankTableWeaponImage weaponSplId={entry.weaponSplId} />
							<div>{entry.name}</div>
							<div className={leaderboardsStyles.tablePower}>
								{entry.power.toFixed(1)}
							</div>
						</RankTableInnerRow>
					</RankTableRow>
				);
			})}
		</RankTable>
	);
}
