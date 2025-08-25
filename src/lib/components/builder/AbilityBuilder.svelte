<script lang="ts">
	import type {
		BuildAbilitiesTupleWithUnknown,
		AbilityWithUnknown,
		AbilityType
	} from '$lib/constants/in-game/types';
	import type { AbilityItem } from './types';
	import { abilities as abilitiesList } from '$lib/constants/in-game/abilities';
	import AbilitySlot from './AbilitySlot.svelte';
	import AbilitySelector from './AbilitySelector.svelte';

	interface Props {
		abilities?: BuildAbilitiesTupleWithUnknown;
	}

	const emptyBuild: BuildAbilitiesTupleWithUnknown = [
		['UNKNOWN', 'UNKNOWN', 'UNKNOWN', 'UNKNOWN'],
		['UNKNOWN', 'UNKNOWN', 'UNKNOWN', 'UNKNOWN'],
		['UNKNOWN', 'UNKNOWN', 'UNKNOWN', 'UNKNOWN']
	];

	let mainAbilities: AbilityItem[] = abilitiesList
		.filter((ability) => ability.type !== 'STACKABLE')
		.map((ability, i) => ({
			id: `main_${i}`,
			abilityType: ability.type,
			ability: ability.name
		}));

	let stackableAbilities: AbilityItem[] = abilitiesList
		.filter((ability) => ability.type === 'STACKABLE')
		.map((ability, i) => ({
			id: `stack_${i}`,
			abilityType: ability.type,
			ability: ability.name
		}));

	let { abilities = $bindable([...emptyBuild]) }: Props = $props();

	function getSlotType(row: number, col: number) {
		if (row === 0 && col === 0) return 'HEAD_MAIN_ONLY';
		if (row === 1 && col === 0) return 'CLOTHES_MAIN_ONLY';
		if (row === 2 && col === 0) return 'SHOES_MAIN_ONLY';
		return 'STACKABLE';
	}

	function getAbilityType(ability: AbilityWithUnknown): AbilityType {
		const main = mainAbilities.find((item) => item.ability === ability);
		return main?.abilityType ?? 'STACKABLE';
	}

	function addAbility(ability: AbilityItem) {
		for (let row = 0; row < abilities.length; row++) {
			for (let col = 0; col < abilities[row].length; col++) {
				const isEmptySlot = abilities[row][col] === 'UNKNOWN';
				const slotType = getSlotType(row, col);
				const canPlace = ability.abilityType === 'STACKABLE' || ability.abilityType === slotType;

				if (isEmptySlot && canPlace) {
					abilities[row][col] = ability.ability;
					return;
				}
			}
		}
	}

	let enabledSlots = $state<AbilityType>('STACKABLE');

	function updateEnabledSlots(ability: AbilityItem | undefined) {
		enabledSlots =
			ability?.abilityType === 'STACKABLE' || !ability ? 'STACKABLE' : ability.abilityType;
	}

	let disabledAbilities: AbilityType[] = $derived.by(() => {
		const disabled: AbilityType[] = [];
		const filledSlots = abilities.flat().filter((a) => a !== 'UNKNOWN').length;

		if (abilities[0][0] !== 'UNKNOWN') disabled.push('HEAD_MAIN_ONLY');
		if (abilities[1][0] !== 'UNKNOWN') disabled.push('CLOTHES_MAIN_ONLY');
		if (abilities[2][0] !== 'UNKNOWN') disabled.push('SHOES_MAIN_ONLY');
		if (filledSlots >= 12) disabled.push('STACKABLE');

		return disabled;
	});
</script>

<div class="container">
	<div class="slots">
		{#each abilities as row, i}
			{#each row as item, j}
				{@const abilityType = getAbilityType(item)}
				{@const slotType = getSlotType(i, j)}
				<AbilitySlot
					abilities={[
						{
							id: Math.floor(Math.random() * 10000000000).toString(),
							abilityType,
							ability: item
						}
					]}
					{slotType}
					disabled={enabledSlots !== 'STACKABLE' && enabledSlots !== slotType}
					ondrag={(ability) => updateEnabledSlots(ability)}
					onchange={(ability) => {
						abilities[i][j] = ability;
					}}
				/>
			{/each}
		{/each}
	</div>

	<AbilitySelector
		abilities={stackableAbilities}
		{disabledAbilities}
		ondrag={(ability) => updateEnabledSlots(ability)}
		onclick={(ability) => addAbility(ability)}
	/>
	<AbilitySelector
		abilities={mainAbilities}
		{disabledAbilities}
		ondrag={(ability) => updateEnabledSlots(ability)}
		onclick={(ability) => addAbility(ability)}
	/>
</div>

<style>
	.container {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--s-3);
	}
	.slots {
		display: grid;
		grid-template-columns: repeat(4, fit-content(100%));
		gap: var(--s-2) var(--s-1-5);
		place-items: center;
	}
</style>
