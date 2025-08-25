<script lang="ts">
	import type { AbilityItem, AbilityItemWithShadow } from './types';
	import type { AbilityType, AbilityWithUnknown } from '$lib/constants/in-game/types';
	import {
		dndzone,
		TRIGGERS,
		SHADOW_ITEM_MARKER_PROPERTY_NAME,
		type DndEvent
	} from 'svelte-dnd-action';
	import Ability from '$lib/components/Ability.svelte';

	interface Props {
		abilities: AbilityItemWithShadow[];
		slotType: AbilityType;
		disabled: boolean;
		ondrag: (ability: AbilityItem | undefined) => void;
		onchange: (ability: AbilityWithUnknown) => void;
	}

	const emptyAbility: AbilityItem = {
		id: '0',
		abilityType: 'STACKABLE',
		ability: 'UNKNOWN'
	};

	let { abilities, slotType, disabled, ondrag, onchange }: Props = $props();

	function onconsider(event: CustomEvent<DndEvent<AbilityItem>>) {
		const { trigger, id } = event.detail.info;

		if (trigger === TRIGGERS.DRAG_STARTED) {
			const draggedAbility = abilities.find((ability) => ability.id === id);
			ondrag(draggedAbility);
		}

		abilities = event.detail.items.length > 0 ? event.detail.items : [emptyAbility];
	}

	function onfinalize(event: CustomEvent<DndEvent<AbilityItem>>) {
		ondrag(undefined);

		const item = event.detail.items[0];

		if (item && item.abilityType !== 'STACKABLE' && item.abilityType !== slotType) {
			abilities = [emptyAbility];
			onchange('UNKNOWN');
			return;
		}

		abilities = item ? [item] : [emptyAbility];
		onchange(item?.ability || 'UNKNOWN');
	}

	function removeItem() {
		abilities = [emptyAbility];
		onchange('UNKNOWN');
	}
</script>

<div
	use:dndzone={{
		items: abilities,
		flipDurationMs: 200,
		zoneTabIndex: -1,
		zoneItemTabIndex: -1,
		dropFromOthersDisabled: disabled,
		dragDisabled: abilities[0] ? abilities[0].ability === 'UNKNOWN' : true,
		dropTargetStyle: {}
	}}
	{onconsider}
	{onfinalize}
>
	{#each abilities as item (item.id)}
		{@const isShadow = item[SHADOW_ITEM_MARKER_PROPERTY_NAME]}
		<Ability
			class={isShadow ? 'shadow-item' : ''}
			ability={isShadow ? 'UNKNOWN' : item.ability}
			size={slotType === 'STACKABLE' ? 'SUB' : 'MAIN'}
			onclick={() => removeItem()}
			{disabled}
		/>
	{/each}
</div>

<style>
	div {
		position: relative;
		display: block;

		:global(.shadow-item) {
			visibility: visible !important;
			position: absolute;
			inset: 0;
			pointer-events: none;
		}
	}
</style>
