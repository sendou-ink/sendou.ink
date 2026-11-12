<!--
	The tournament layout with its brackets page, read only: viewing and compactifying an elimination bracket.
	Not ported: check-in, finalizing, starting brackets and preparing maps, spoiler-free mode, the group tabs,
	round robin and swiss brackets, and the live updates the React page subscribes to.
-->
<script lang="ts">
import { Eye, EyeOff } from "@lucide/svelte";
import { Tournament } from "~/features/tournament-bracket/core/Tournament";
import { tournamentBracketsPage } from "~/features/tournament-bracket/tournament-bracket-urls";
import { goto } from "$app/navigation";
import Button from "#lib/components/Button.svelte";
import Main from "#lib/components/Main.svelte";
import Tab from "#lib/components/Tab.svelte";
import TabList from "#lib/components/TabList.svelte";
import TabPanel from "#lib/components/TabPanel.svelte";
import Tabs from "#lib/components/Tabs.svelte";
import type { getTournamentBracketsPage } from "../tournament-bracket.remote.ts";
import Bracket from "./Bracket.svelte";
import TournamentNav from "./TournamentNav.svelte";

interface Props {
	data: Awaited<ReturnType<typeof getTournamentBracketsPage>>;
	user: { id: number } | null | undefined;
}

let { data, user }: Props = $props();

let bracketExpanded = $state(true);

const tournament = $derived.by(() => {
	const layoutTournament = new Tournament(data.layout.tournament);

	return data.brackets.bracket
		? layoutTournament.withBrackets([data.brackets.bracket], {
				participatedUsers: data.brackets.participatedUserIds,
				streams: data.brackets.streams,
			})
		: layoutTournament;
});
const bracketIdx = $derived(data.brackets.bracketIdx);
const bracket = $derived(tournament.bracketByIdx(bracketIdx));
const visibleBrackets = $derived(
	tournament.visibleBracketsMetaOfDivision(data.brackets.divisionIdx),
);
const canCompactify = $derived(
	bracket &&
		bracket.type !== "round_robin" &&
		!bracket.preview &&
		tournament.bracketsMeta[bracketIdx].enoughTeams,
);
const ownTeamId = $derived(tournament.teamMemberOfByUser(user as never)?.id);
const isPortedBracket = $derived(
	bracket?.type === "single_elimination" || bracket?.type === "double_elimination",
);
</script>

<Main breakoutContainer>
	<div class="container-wide">
		<TournamentNav
			{tournament}
			streamsCount={data.layout.streamsCount}
			{user}
		/>
		<div>
			<Tabs
				selectedKey={String(bracketIdx)}
				onSelectionChange={(key) =>
					goto(
						tournamentBracketsPage({
							tournamentId: tournament.ctx.id,
							bracketIdx: Number(key),
						}),
					)}
			>
				<TabList actions={canCompactify ? compactifyButton : undefined}>
					{#each visibleBrackets as visibleBracket (visibleBracket.name)}
						<Tab
							id={String(visibleBracket.idx)}
							number={tournament.teamsCountOfBracket(visibleBracket.idx)}
						>
							{visibleBracket.name.replace("bracket", "")}
						</Tab>
					{/each}
				</TabList>
				{#each visibleBrackets as visibleBracket (visibleBracket.idx)}
					<TabPanel id={String(visibleBracket.idx)}>
						{#if bracket && tournament.bracketsMeta[bracketIdx].enoughTeams && isPortedBracket}
							<Bracket
								{bracket}
								{tournament}
								{ownTeamId}
								groupId={data.brackets.groupId}
								exitGroups={data.brackets.exitGroups}
								isExpanded={bracketExpanded}
								vods={data.layout.vods ?? []}
							/>
						{:else if bracket}
							<div class="text-center text-lg font-semi-bold text-lighter mt-6">
								This bracket's state is not ported to the Svelte slice
							</div>
						{/if}
					</TabPanel>
				{/each}
			</Tabs>
		</div>
	</div>
</Main>

{#snippet compactifyButton()}
	<Button
		onclick={() => {
			bracketExpanded = !bracketExpanded;
		}}
		variant="minimal"
		size="miniscule"
		class="compactify-button"
	>
		{#snippet icon(iconClass)}
			{#if bracketExpanded}<EyeOff class={iconClass} />{:else}<Eye class={iconClass} />{/if}
		{/snippet}
		{bracketExpanded ? "Compactify" : "Show all"}
	</Button>
{/snippet}

<style>
	@layer features {
		.container-wide {
			width: 100%;
			max-width: 72rem;
			margin-inline: auto;
		}

		.container-wide :global(.compactify-button) {
			color: var(--color-text-high);
			white-space: nowrap;
		}
	}
</style>
