<script lang="ts">
	import { fromAction } from 'svelte/attachments';
	import { dndzone, TRIGGERS, type DndEvent } from 'svelte-dnd-action';
	import Ability from '$lib/components/Ability.svelte';
	import type { AbilityItem } from './types';
	import type { AbilityType, AbilityWithUnknown } from '$lib/constants/in-game/types';

	interface Props {
		ability: AbilityItem[];
		slotType: AbilityType;
		disabled?: boolean;
		dragDisabled?: boolean;
		ondrag: (ability: AbilityItem | undefined) => void;
		onchange: (ability: AbilityWithUnknown) => void;
	}

	const emptyAbility: AbilityItem = {
		id: '0',
		abilityType: 'STACKABLE',
		ability: 'UNKNOWN'
	};

	/*
	We have to make ability an array because the library demands it,
	but the array will only ever contain one item, which is the ability the slot is currently holding
	*/
	let {
		ability,
		slotType,
		disabled = false,
		dragDisabled = false,
		ondrag,
		onchange
	}: Props = $props();

	function onconsider(event: CustomEvent<DndEvent<AbilityItem>>) {
		const { trigger, id } = event.detail.info;

		if (trigger === TRIGGERS.DRAG_STARTED) {
			const draggedAbility = ability.find((ability) => ability.id === id);
			ondrag(draggedAbility);
		}

		ability = event.detail.items;
	}

	function onfinalize(event: CustomEvent<DndEvent<AbilityItem>>) {
		ondrag(undefined);

		const item = event.detail.items[0];
		console.log(item);

		if (item && item.abilityType !== 'STACKABLE' && item.abilityType !== slotType) {
			ability = [emptyAbility];
			onchange('UNKNOWN');
			return;
		}

		ability = item ? [item] : [emptyAbility];
		onchange(item?.ability || 'UNKNOWN');
	}

	function removeItem() {
		ability = [emptyAbility];
		onchange('UNKNOWN');
	}
</script>

<div
	use:dndzone={{
		items: ability,
		flipDurationMs: 200,
		zoneTabIndex: -1,
		zoneItemTabIndex: -1,
		dropFromOthersDisabled: disabled,
		dragDisabled,
		dropTargetStyle: {}
	}}
	{onconsider}
	{onfinalize}
	class={disabled ? 'disabled' : ''}
>
	{#each ability as item, i (item.id)}
		{#if i === 0}
			<Ability ability={item.ability} size="SUB" onclick={() => removeItem()} />
		{/if}
	{/each}
</div>
