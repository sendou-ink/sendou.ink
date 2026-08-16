<script lang="ts">
	import { rankedModesShort } from "@sendou/in-game-lists/modes";
	import type { MainWeaponId } from "@sendou/in-game-lists/types";
	import { weaponCategories } from "@sendou/in-game-lists/weapon-ids";
	import {
		ChipRadio,
		ChipRadioGroup,
		Tab,
		TabList,
		TabPanel,
		Tabs,
	} from "@sendou/components";
	import Image from "#lib/components/Image.svelte";
	import Main from "#lib/components/Main.svelte";
	import ModeImage from "#lib/components/ModeImage.svelte";
	import WeaponSelect from "#lib/components/WeaponSelect.svelte";
	import SeasonSelect from "#lib/features/mmr/SeasonSelect.svelte";
	import * as Seasons from "#lib/features/mmr/Seasons.ts";
	import { searchParamsState } from "#lib/modules/search-params/search-params-state.svelte.ts";
	import { m } from "#lib/paraglide/messages.js";
	import {
		modeLongName,
		weaponCategoryName,
	} from "#lib/modules/i18n/messages.ts";
	import { navIconUrl, userSeasonsPage, weaponCategoryUrl } from "#lib/utils/urls.ts";
	import { leaderboardsSearchParams } from "../leaderboards-search-params.ts";
	import { seasonHasTopTen } from "../leaderboards-utils.ts";
	import { getLeaderboards } from "../leaderboards.remote.ts";
	import OwnEntryPeek from "./OwnEntryPeek.svelte";
	import PlayersTable from "./PlayersTable.svelte";
	import TeamTable from "./TeamTable.svelte";
	import TopTenPlayer from "../TopTenPlayer.svelte";
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
	<div class="stack lg leaderboards">
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

<style>
	.leaderboards :global(.table) {
		display: flex;
		flex-direction: column;
		gap: var(--s-0-5);
		font-size: var(--font-sm);
		font-weight: var(--weight-semi);
	}

	.leaderboards :global(.tableRank) {
		min-width: 28px;
		text-align: right;
	}

	.leaderboards :global(.tableName) {
		white-space: nowrap;
		text-overflow: ellipsis;
		overflow: hidden;
		max-width: 117px;
	}

	.leaderboards :global(.tierHeader) {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		margin-block: var(--s-2);
		color: var(--color-text-high);
	}

	.leaderboards :global(.tableRow) {
		background-color: var(--color-bg-high);
		display: flex;
		padding: var(--s-2) var(--s-3);
		align-items: center;
		justify-content: space-between;
		color: var(--color-text);
		transition: 0.1s ease-in-out background-color;
		border-radius: 0;
	}

	.leaderboards :global(.tableRow:first-of-type) {
		border-radius: var(--radius-box) var(--radius-box) 0 0;
	}

	.leaderboards :global(.tableRow:last-of-type) {
		border-radius: 0 0 var(--radius-box) var(--radius-box);
	}

	.leaderboards :global(.tableRow:only-child) {
		border-radius: var(--radius-box);
	}

	.leaderboards :global(a.tableRow:hover) {
		background-color: var(--color-bg-higher);
	}

	.leaderboards :global(.tableRowQualification) {
		font-size: var(--font-xs);
		font-weight: var(--weight-semi);
		justify-content: center;
		background-color: var(--color-bg-higher);
		display: flex;
		gap: var(--s-2);
	}

	.leaderboards :global(.tableWeapon) {
		background-color: var(--color-bg);
		border-radius: 100%;
	}

	.leaderboards :global(.tablePower) {
		margin-inline-start: auto;
	}

	.leaderboards :global(.tableInnerRow) {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		width: 100%;
	}

	.leaderboards :global(.avatar) {
		min-width: 24px;
		min-height: 24px;
	}

	.leaderboards :global(.skippedTeam) {
		text-decoration: line-through;
	}

	.leaderboards :global(.skippedTeam a) {
		color: var(--color-text-high);
	}
</style>
