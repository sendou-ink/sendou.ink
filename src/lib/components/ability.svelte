<script lang="ts">
	import type { AbilityWithUnknown } from '$lib/constants/in-game/types';
	import { abilityTranslations } from '$lib/utils/i18n';
	import { abilityImageUrl } from '$lib/utils/urls';
	import Image from '$lib/components/image/Image.svelte';

	interface Props {
		ability: AbilityWithUnknown;
		size: keyof typeof sizeMap;
		dragStarted?: boolean;
		dropAllowed?: boolean;
		onClick?: VoidFunction;
		onDrop?: (event: DragEvent) => void;
		class?: string;
	}

	const {
		ability,
		size,
		dragStarted = false,
		dropAllowed = false,
		onClick: onclick,
		onDrop,
		class: className
	}: Props = $props();

	const sizeMap = {
		MAIN: 42,
		SUB: 32,
		SUBTINY: 26,
		TINY: 22
	} as const;

	const sizeNumber = $derived(sizeMap[size]);
	const readonly = $derived(typeof onclick === 'undefined' || ability === 'UNKNOWN');

	let isDragTarget = $state(false);

	function ondragover(event: DragEvent) {
		event.preventDefault();
		isDragTarget = true;
	}

	function ondragleave() {
		isDragTarget = false;
	}

	function ondrop(event: DragEvent) {
		isDragTarget = false;
		onDrop?.(event);
	}
</script>

<svelte:element
	this={readonly ? 'div' : 'button'}
	class={[
		'ability',
		className,
		{
			'is-drag-target': isDragTarget,
			'drag-started': dragStarted,
			'drop-allowed': dropAllowed,
			readonly
		}
	]}
	style:--ability-size="{sizeNumber}px"
	type={readonly ? undefined : 'button'}
	role={readonly ? undefined : 'button'}
	data-testid="{ability}-ability"
	{onclick}
	{ondragover}
	{ondragleave}
	{ondrop}
>
	<Image
		alt={abilityTranslations[ability]()}
		title={abilityTranslations[ability]()}
		path={abilityImageUrl(ability)}
		size={sizeNumber}
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

	.is-drag-target {
		/* background: var(--abilities-button-bg); xxx: different color? */
		transform: scale(1.15);
	}

	.drag-started:not(.drop-allowed) {
		filter: grayscale(1);
		opacity: 0.3;
		pointer-events: none;
	}

	.readonly,
	.readonly:active {
		cursor: default;
		transform: none;
	}
</style>
