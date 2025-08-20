<script lang="ts">
	import { asset } from '$app/paths';
	import { stageIds } from '$lib/constants/in-game/stage-ids';
	import type { ModeShort, StageId } from '$lib/constants/in-game/types';
	import { nullFilledArray } from '$lib/utils/arrays';
	import { stageTranslations } from '$lib/utils/i18n';
	import Divider from './Divider.svelte';
	import Check from '@lucide/svelte/icons/check';

	interface Props {
		mode: ModeShort;
		maxCount: number;
		pool: StageId[];
		bannedMaps?: StageId[];
		tiebreaker?: StageId;
	}

	let { mode, maxCount, pool = $bindable(), tiebreaker, bannedMaps }: Props = $props();

	let wigglingStageId = $state<StageId | null>(null);
	$effect(() => {
		if (wigglingStageId === null) return;
		const timeout = setTimeout(() => {
			wigglingStageId = null;
		}, 1000);

		return () => {
			clearTimeout(timeout);
		};
	});

	const stages = $derived([...pool, ...nullFilledArray(maxCount - pool.length)]);

	function stageClickHandler(stageId: StageId) {
		return () => {
			if (tiebreaker === stageId) return;
			if (bannedMaps?.includes(stageId)) return;
			if (stages.includes(stageId)) {
				pool = pool.filter((s) => s !== stageId);
				return;
			}

			handleUnpickedStageClick(stageId);
		};
	}

	function handleUnpickedStageClick(stageId: StageId) {
		// is there space left?
		if (stages[maxCount - 1] !== null) {
			wigglingStageId = stageId;
			return;
		}

		// was it already picked?
		if (pool.includes(stageId)) {
			return;
		}

		const newPool = [...pool, stageId].sort((a, b) => a - b);
		pool = newPool;
	}
</script>

<div class="container stack sm">
	<div class="stack sm horizontal justify-center">
		{#each { length: maxCount }, index}
			{@render mapSlot({ number: index + 1, picked: stages[index] !== null })}
		{/each}
	</div>
	<Divider class="divider">
		<img src={asset(`/img/modes/${mode}.avif`)} height={32} width={32} alt="" />
	</Divider>
	<div class="stack sm horizontal flex-wrap justify-center mt-1">
		{#each stageIds as stageId (stageId)}
			{@render mapButton({
				stageId,
				onclick: stageClickHandler(stageId),
				selected: stages.includes(stageId),
				banned: bannedMaps?.includes(stageId),
				tiebreaker: tiebreaker === stageId,
				wiggling: wigglingStageId === stageId,
				testId: `map-pool-${mode}-${stageId}`
			})}
		{/each}
	</div>
</div>

{#snippet mapSlot({ number, picked }: { number: number; picked: boolean })}
	<div class={['slot', { picked }]}>
		{#if picked}
			<Check />
		{:else}
			{number}
		{/if}
	</div>
{/snippet}

{#snippet mapButton({
	stageId,
	onclick,
	selected = false,
	banned = false,
	tiebreaker = false,
	wiggling = false,
	testId
}: {
	stageId: StageId;
	onclick: () => void;
	selected?: boolean;
	banned?: boolean;
	tiebreaker?: boolean;
	wiggling?: boolean;
	testId?: string;
})}
	<div class="stack items-center relative">
		<button
			class={['map-button', { 'greyed-out': selected || banned || tiebreaker, wiggling }]}
			style="--map-image-url: url('{asset(`/img/stages/${stageId}.avif`)}')"
			{onclick}
			disabled={banned}
			type="button"
			data-testid={testId}
			aria-label={stageTranslations[stageId]()}
		></button>
		{#if selected}
			<Check class="map-button__icon" {onclick} />
		{/if}
		{#if tiebreaker}
			<div class="map-button__text text-info">Tiebreak</div>
		{:else if banned}
			<div class="map-button__text text-error">Banned</div>
		{/if}
		<div class="map-button__label">
			{stageTranslations[stageId]()}
		</div>
	</div>
{/snippet}

<style>
	.container {
		--map-width: 90px;
		--map-height: 50px;

		:global {
			.divider {
				font-size: var(--fonts-xs);
				font-weight: var(--semi-bold);
				text-transform: uppercase;
				display: flex;
				gap: var(--s-2);

				&::before,
				&::after {
					border-bottom: 2px dotted var(--color-primary-transparent);
				}
			}

			.map-button__icon {
				position: absolute;
				top: 8.5px;
				color: var(--color-success);
				width: 36px;
				height: 36px;
				stroke-width: 3px;
				cursor: pointer;
			}
		}
	}

	.slot {
		font-size: var(--fonts-xs);
		display: grid;
		place-items: center;
		color: var(--color-base-content-secondary);
		border-radius: var(--radius-field);
		font-weight: var(--bold);
		width: 24px;
		height: 24px;
		border: 2px dotted var(--color-primary-transparent);

		&.picked {
			border-style: solid;
		}

		:global {
			svg {
				color: var(--color-success);
				width: 16px;
				stroke-width: 3px;
			}
		}
	}

	.map-button {
		background-image: var(--map-image-url);
		background-size: contain;
		height: var(--map-height);
		width: var(--map-width);
		border: none;
		background-color: transparent;
		transition:
			filter,
			opacity 0.2s;
		border-radius: var(--radius-field);
		cursor: pointer;

		&.greyed-out {
			filter: grayscale(100%) !important;
			opacity: 0.4 !important;
		}

		&:focus-visible {
			outline: 1px solid var(--color-secondary);
		}
	}

	@keyframes wiggle {
		0% {
			transform: rotate(0deg);
		}

		25% {
			transform: rotate(5deg);
		}

		75% {
			transform: rotate(-5deg);
		}

		100% {
			transform: rotate(0deg);
		}
	}

	.wiggling {
		animation: wiggle 0.25s infinite;
		animation-iteration-count: 1;
	}

	.map-button:active {
		transform: none;
	}

	.map-button__text {
		position: absolute;
		top: 14px;
		text-transform: uppercase;
		font-weight: var(--bold);
		cursor: not-allowed;
		user-select: none;
	}

	.map-button__label {
		font-size: var(--fonts-xxxxs);
		color: var(--text-lighter);
		font-weight: var(--semi-bold);
	}
</style>
