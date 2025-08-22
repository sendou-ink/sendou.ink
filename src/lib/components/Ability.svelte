<script lang="ts">
	import { asset } from '$app/paths';
	import type { AbilityWithUnknown } from '$lib/constants/in-game/types';
	import { abilityTranslations } from '$lib/utils/i18n';

	interface Props {
		ability: AbilityWithUnknown;
		size: keyof typeof sizeMap;
		onclick?: VoidFunction;
		class?: string;
	}

	const { ability, size, onclick, class: className }: Props = $props();

	const sizeMap = {
		MAIN: 42,
		SUB: 32,
		SUBTINY: 26,
		TINY: 22
	} as const;

	const sizeNumber = $derived(sizeMap[size]);
	const readonly = $derived(typeof onclick === 'undefined' || ability === 'UNKNOWN');
</script>

<svelte:element
	this={readonly ? 'div' : 'button'}
	class={[
		'ability',
		className,
		{
			readonly
		}
	]}
	style:--ability-size="{sizeNumber}px"
	type={readonly ? undefined : 'button'}
	role={readonly ? undefined : 'button'}
	data-testid="{ability}-ability"
	{onclick}
>
	<img
		alt={abilityTranslations[ability]()}
		title={abilityTranslations[ability]()}
		src={asset(`/img/abilities/${ability}.avif`)}
		width={sizeNumber}
		height={sizeNumber}
	/>
</svelte:element>

<style>
	.ability {
		width: var(--ability-size);
		height: var(--ability-size);
		padding: 0;
		border: 2px solid var(--color-primary-transparent);
		border-radius: 50%;
		border-right: 0;
		border-bottom: 0;
		background: var(--color-base-card-section);
		background-size: 100%;
		box-shadow: 0 0 0 1px var(--color-base-card-section);
		transform: scale(1);
		transition: all 0.1s ease;
		user-select: none;

		:global(img) {
			margin-block-start: -1px;
		}
	}

	.readonly,
	.readonly:active {
		cursor: default;
		transform: none;
	}
</style>
