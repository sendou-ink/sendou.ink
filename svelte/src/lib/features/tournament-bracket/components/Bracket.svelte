<!--
	An elimination bracket in its scrolling container. Round robin and swiss brackets, the group tabs of a bracket
	split into groups, dragging to scroll and remembering the scroll position are not ported.
-->
<script lang="ts">
import type { Bracket } from "~/features/tournament-bracket/core/Bracket";
import type { MatchExitGroupsById } from "~/features/tournament-bracket/core/Bracket/Bracket";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import type { VodsByTournamentId } from "~/features/tournament-bracket/TournamentMatchVodRepository.server";
import EliminationBracketSide from "./EliminationBracketSide.svelte";

interface Props {
	bracket: Bracket;
	tournament: Tournament;
	ownTeamId: number | undefined;
	/** Group whose matches were loaded. */
	groupId?: number | null;
	exitGroups?: MatchExitGroupsById;
	isExpanded: boolean;
	vods: VodsByTournamentId;
}

let {
	bracket,
	tournament,
	ownTeamId,
	groupId,
	exitGroups,
	isExpanded,
	vods,
}: Props = $props();

// group of the shipped matches rather than the search param's, so a switch shows once its matches loaded
const selectedGroupId = $derived(groupId ?? bracket.data.group[0]?.id);

/**
 * Inside a breakout container publishes the bracket's distance from the document top as `--bracket-fill-top`,
 * from which CSS derives its `max-height`. The sticky footer ad the React app also accounts for is not in the slice.
 */
function publishFillOffsets(element: HTMLDivElement) {
	if (!element.closest("[data-main-breakout]")) return;

	const update = () => {
		element.style.setProperty(
			"--bracket-fill-top",
			`${element.getBoundingClientRect().top + window.scrollY}px`,
		);
		element.style.setProperty("--bracket-fill-bottom-ad", "0px");
	};
	update();

	const resizeObserver = new ResizeObserver(update);
	resizeObserver.observe(document.body);
	window.addEventListener("resize", update);

	return () => {
		resizeObserver.disconnect();
		window.removeEventListener("resize", update);
	};
}
</script>

<div class="stack lg">
	<div class="breakout-wrapper">
		<div
			class="bracket scrolling-bracket"
			data-testid="brackets-viewer"
			data-bracket-container
			data-bracket-scroller
			{@attach publishFillOffsets}
		>
			{#if bracket.type === "single_elimination"}
				<EliminationBracketSide
					type="single"
					{bracket}
					{tournament}
					{ownTeamId}
					groupId={selectedGroupId}
					{isExpanded}
					{exitGroups}
					{vods}
				/>
			{:else}
				<EliminationBracketSide
					type="winners"
					{bracket}
					{tournament}
					{ownTeamId}
					groupId={selectedGroupId}
					{isExpanded}
					{exitGroups}
					{vods}
				/>
				<EliminationBracketSide
					type="losers"
					{bracket}
					{tournament}
					{ownTeamId}
					groupId={selectedGroupId}
					{isExpanded}
					{exitGroups}
					{vods}
				/>
			{/if}
		</div>
	</div>
</div>

<style>
	@layer features {
		/* --match-height and the gap must match the constants in EliminationBracketSide.svelte */
		.bracket {
			--match-width: 140px;
			--match-height: 55px;
			overflow-x: auto;
			display: flex;
			flex-direction: column;
			gap: var(--s-8);
			padding-block-end: var(--s-6);
		}

		.scrolling-bracket {
			padding: var(--s-4) var(--s-6);
			max-width: 100%;
			max-height: min(1200px, 82dvh);
			scrollbar-width: none;
			border: var(--border-style);
			border-radius: var(--radius-box);
			overflow: scroll;
			user-select: none;

			:global([data-main-breakout]) & {
				width: fit-content;
				min-width: min(72rem, 100%);
				margin-inline: auto;
				max-height: max(
					300px,
					calc(
						100svh -
						var(--bracket-fill-top, 30svh) -
						var(--bracket-fill-bottom-ad, 0px) -
						var(--s-6)
					)
				);

				@media screen and (max-width: 599.98px) {
					max-height: max(
						300px,
						calc(
							100svh -
							var(--bracket-fill-top, 30svh) -
							var(--bracket-fill-bottom-ad, 0px) -
							var(--layout-nav-height) -
							env(safe-area-inset-bottom) -
							var(--s-3)
						)
					);
				}
			}
		}

		/* sizes against the full content area: cqw resolves to <main>, which spans it in breakout mode */
		.breakout-wrapper {
			:global([data-main-breakout]) & {
				width: 100cqw;
				margin-inline: calc(50% - 50cqw);
			}
		}
	}
</style>
