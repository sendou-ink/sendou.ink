<script lang="ts">
import {
	ChipRadio,
	ChipRadioGroup,
	Tab,
	TabList,
	TabPanel,
	Tabs,
} from "@sendou/components";
import { rankedModesShort } from "@sendou/in-game-lists/modes";
import type { MainWeaponId } from "@sendou/in-game-lists/types";
import { weaponCategories } from "@sendou/in-game-lists/weapon-ids";
import Image from "#lib/components/Image.svelte";
import Main from "#lib/components/Main.svelte";
import ModeImage from "#lib/components/ModeImage.svelte";
import WeaponSelect from "#lib/components/WeaponSelect.svelte";
import SeasonSelect from "#lib/features/mmr/SeasonSelect.svelte";
import * as Seasons from "#lib/features/mmr/Seasons.ts";
import {
	modeLongName,
	weaponCategoryName,
} from "#lib/modules/i18n/messages.ts";
import { searchParamsState } from "#lib/modules/search-params/search-params-state.svelte.ts";
import { m } from "#lib/paraglide/messages.js";
import {
	navIconUrl,
	userSeasonsPage,
	weaponCategoryUrl,
} from "#lib/utils/urls.ts";
import { getLeaderboards } from "../leaderboards.remote.ts";
import { leaderboardsSearchParams } from "../leaderboards-search-params.ts";
import { seasonHasTopTen } from "../leaderboards-utils.ts";
import TopTenPlayer from "../TopTenPlayer.svelte";
import OwnEntryPeek from "./OwnEntryPeek.svelte";
import PlayersTable from "./PlayersTable.svelte";
import TeamTable from "./TeamTable.svelte";
import XPTable from "./XPTable.svelte";

const params = searchParamsState(leaderboardsSearchParams);

const data = $derived(await getLeaderboards(params.current));

const isAllUserLeaderboard = $derived(params.current.type === "USER");

const selectedTab = $derived(
	params.current.type.startsWith("XP")
		? "XP"
		: params.current.type.startsWith("TEAM")
			? "TEAMS"
			: "PLAYERS",
);

const showTopTen = $derived(
	Boolean(
		seasonHasTopTen(data.season) &&
			isAllUserLeaderboard &&
			data.userLeaderboard,
	),
);

const renderNoEntries = $derived(
	(data.userLeaderboard && data.userLeaderboard.length === 0) ||
		(data.teamLeaderboard && data.teamLeaderboard.length === 0),
);

const selectedWeaponId = $derived(
	params.current.type.startsWith("XP-WEAPON")
		? (Number(params.current.type.split("-")[2]) as MainWeaponId)
		: null,
);

function onTabChange(key: string) {
	if (key === selectedTab) return;
	if (key === "PLAYERS") return params.set({ type: "USER" });
	if (key === "TEAMS") return params.set({ type: "TEAM" });
	params.set({ type: "XP-ALL", season: null });
}
</script>

<Main halfWidth>
	<div class="stack lg">
		<Tabs selectedKey={selectedTab} onSelectionChange={onTabChange}>
			<TabList>
				<Tab id="PLAYERS">
					{#snippet icon()}
						<Image path={navIconUrl("sendouq")} alt="" width={16} />
					{/snippet}
					{m.common_leaderboard_tabs_players()}
				</Tab>
				<Tab id="TEAMS">
					{#snippet icon()}
						<Image path={navIconUrl("sendouq")} alt="" width={16} />
					{/snippet}
					{m.common_leaderboard_tabs_teams()}
				</Tab>
				<Tab id="XP">
					{#snippet icon()}
						<Image path={navIconUrl("xsearch")} alt="" width={16} />
					{/snippet}
					{m.common_leaderboard_tabs_xp()}
				</Tab>
			</TabList>
			<TabPanel id="PLAYERS">
				<div class="stack md">
					<SeasonSelect
						label={m.common_leaderboard_season()}
						season={data.season}
						onChange={(season) => params.set({ season })}
					/>
					<ChipRadioGroup wrap>
						<ChipRadio
							name="weapon-category"
							value="ALL"
							checked={params.current.type === "USER"}
							onChange={() => params.set({ type: "USER" })}
						>
							{m.common_leaderboard_filter_all()}
						</ChipRadio>
						{#each weaponCategories as category (category.name)}
							<ChipRadio
								name="weapon-category"
								value={category.name}
								checked={params.current.type === `USER-${category.name}`}
								onChange={() => params.set({ type: `USER-${category.name}` })}
							>
								<span class="stack horizontal xs items-center">
									<Image
										path={weaponCategoryUrl(category.name)}
										size={18}
										alt=""
									/>
									{weaponCategoryName(category.name)}
								</span>
							</ChipRadio>
						{/each}
					</ChipRadioGroup>
				</div>
			</TabPanel>
			<TabPanel id="TEAMS">
				<div class="stack md">
					<SeasonSelect
						label={m.common_leaderboard_season()}
						season={data.season}
						onChange={(season) => params.set({ season })}
					/>
					<ChipRadioGroup>
						<ChipRadio
							name="team-scope"
							value="TEAM"
							checked={params.current.type === "TEAM"}
							onChange={() => params.set({ type: "TEAM" })}
						>
							{m.common_leaderboard_teams_best()}
						</ChipRadio>
						<ChipRadio
							name="team-scope"
							value="TEAM-ALL"
							checked={params.current.type === "TEAM-ALL"}
							onChange={() => params.set({ type: "TEAM-ALL" })}
						>
							{m.common_leaderboard_teams_all()}
						</ChipRadio>
					</ChipRadioGroup>
				</div>
			</TabPanel>
			<TabPanel id="XP">
				<div class="stack md">
					<ChipRadioGroup wrap>
						<ChipRadio
							name="xp-mode"
							value="XP-ALL"
							checked={params.current.type === "XP-ALL"}
							onChange={() => params.set({ type: "XP-ALL" })}
						>
							{m.common_leaderboard_filter_allModes()}
						</ChipRadio>
						{#each rankedModesShort as mode (mode)}
							<ChipRadio
								name="xp-mode"
								value={`XP-MODE-${mode}`}
								checked={params.current.type === `XP-MODE-${mode}`}
								onChange={() => params.set({ type: `XP-MODE-${mode}` })}
							>
								<span class="stack horizontal xs items-center">
									<ModeImage {mode} size={18} />
									{modeLongName(mode)}
								</span>
							</ChipRadio>
						{/each}
					</ChipRadioGroup>
					<WeaponSelect
						clearable
						value={selectedWeaponId}
						onChange={(weaponId) =>
							params.set({
								type: weaponId === null ? "XP-ALL" : `XP-WEAPON-${weaponId}`,
							})}
					/>
				</div>
			</TabPanel>
		</Tabs>

		{#if showTopTen}
			<div class="stack lg mx-auto">
				{#each data.userLeaderboard!.slice(0, 10) as entry, i (`${entry.id}-${data.season}`)}
					<a href={userSeasonsPage({ user: entry, season: data.season })}>
						<TopTenPlayer
							placement={i + 1}
							power={entry.power}
							season={data.season}
						/>
					</a>
				{/each}
			</div>
		{/if}

		{#if data.ownEntryPeek}
			<OwnEntryPeek
				entry={data.ownEntryPeek.entry}
				nextTier={data.ownEntryPeek.nextTier}
				season={data.season}
			/>
		{/if}

		{#if data.userLeaderboard}
			<PlayersTable
				entries={data.userLeaderboard}
				season={data.season}
				showTiers={isAllUserLeaderboard}
				showingTopTen={showTopTen}
			/>
		{/if}
		{#if data.teamLeaderboard}
			<TeamTable
				entries={data.teamLeaderboard}
				season={data.season}
				queryArgs={params.current}
				showQualificationDividers={params.current.type !== "TEAM-ALL"}
			/>
		{/if}
		{#if data.xpLeaderboard}
			<XPTable entries={data.xpLeaderboard} />
		{/if}

		{#if renderNoEntries}
			<div class="text-center text-lg text-lighter">
				{data.userLeaderboard
					? m.common_leaderboard_noPlayers()
					: m.common_leaderboard_noTeams()}
			</div>
		{/if}

		{#if !data.xpLeaderboard && data.season === Seasons.current()?.nth}
			<div class="text-xs text-lighter text-center">
				{m.common_leaderboard_updateInfo()}
			</div>
		{/if}
	</div>
</Main>

