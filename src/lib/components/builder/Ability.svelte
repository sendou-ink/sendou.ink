<script lang="ts">
	import type { AbilityWithUnknown } from '$lib/constants/in-game/types';
	import { asset } from '$app/paths';
	import { abilityTranslations } from '$lib/utils/i18n';

	interface Props {
		ability: AbilityWithUnknown;
		size: keyof typeof sizeMap;
		disabled?: boolean;
		class?: string;
		onclick?: VoidFunction;
	}

	const { ability, size, disabled, class: className, onclick }: Props = $props();

	const sizeMap = {
		MAIN: 42,
		SUB: 32,
		SUBTINY: 26,
		TINY: 22
	} as const;

	const sizeNumber = $derived(sizeMap[size]);
	const isReadonly = $derived(!onclick || ability === 'UNKNOWN');
	const isDisabled = $derived(!isReadonly && disabled);
</script>

<svelte:element
	this={isReadonly ? 'div' : 'button'}
	class={[
		'ability',
		className,
		{
			readonly: isReadonly,
			disabled: isDisabled
		}
	]}
	style:--ability-size="{sizeNumber}px"
	type={isReadonly ? undefined : 'button'}
	role={isReadonly ? undefined : 'button'}
	disabled={!isReadonly && isDisabled}
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
		border-width: 2px 0 0 2px !important;
		border-radius: 50%;
		background: var(--color-base-card-section);
		background-size: 100%;
		box-shadow: 0 0 0 1px var(--color-base-card-section);
		user-select: none;
		display: block;
		outline: 0;

		:global(img) {
			margin-block-start: -1px;
		}

		&.disabled {
			pointer-events: none;
			cursor: not-allowed;
			opacity: 0.5;
		}

		&.readonly {
			cursor: default;
		}
	}

	img {
		width: 100%;
		height: 100%;
	}
</style>
