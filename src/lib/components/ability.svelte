<script lang="ts">
	import Image from '$lib/components/image/image.svelte';
	import type { AbilityWithUnknown } from '$lib/constants/in-game/types';
	import { abilityTranslations } from '$lib/utils/i18n';
	import { abilityImageUrl } from '$lib/utils/urls';

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
		onClick,
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
	let isDragTarget = $state(false);

	const onDragOver = (event: DragEvent) => {
		event.preventDefault();
		isDragTarget = true;
	};

	const onDragLeave = () => {
		isDragTarget = false;
	};

	const readonly = $derived(typeof onClick === 'undefined' || ability === 'UNKNOWN');

	const handleDrop = (event: DragEvent) => {
		isDragTarget = false;
		onDrop?.(event);
	};
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
	onclick={onClick}
	data-testid="{ability}-ability"
	ondragover={onDragOver}
	ondragleave={onDragLeave}
	ondrop={handleDrop}
	type={readonly ? undefined : 'button'}
	role={readonly ? undefined : 'button'}
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
		border: 2px solid var(--theme-transparent);
		border-radius: 50%;
		border-right: 0;
		border-bottom: 0;
		background: var(--bg-ability);
		background-size: 100%;
		box-shadow: 0 0 0 1px var(--bg-ability);
		transform: scale(1);
		transition: all 0.1s ease;
		user-select: none;
	}

	.is-drag-target {
		background: var(--abilities-button-bg);
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
