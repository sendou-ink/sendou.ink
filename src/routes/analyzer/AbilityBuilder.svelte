<script lang="ts">
	import AbilitySlot from './AbilitySlot.svelte';
	import AbilitySelector from './AbilitySelector.svelte';
	import type {
		BuildAbilitiesTupleWithUnknown,
		AbilityWithUnknown
	} from '$lib/constants/in-game/types';
	import type { AbilityItem } from './types';
	import { abilities as abilitiesList } from '$lib/constants/in-game/abilities';

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

	function slotTypeFromIndex(i: number, j: number) {
		if (i === 0 && j === 0) return 'HEAD_MAIN_ONLY';
		if (i === 1 && j === 0) return 'CLOTHES_MAIN_ONLY';
		if (i === 2 && j === 0) return 'SHOES_MAIN_ONLY';
		return 'STACKABLE';
	}

	function abilityTypeFromName(ability: AbilityWithUnknown) {
		const main = mainAbilities.find((item) => item.ability === ability);
		if (main) return main.abilityType;
		return 'STACKABLE';
	}

	function addAbility(ability: AbilityItem) {
		for (let i = 0; i < abilities.length; i++) {
			for (let j = 0; j < abilities[i].length; j++) {
				if (
					abilities[i][j] === 'UNKNOWN' &&
					(ability.abilityType === 'STACKABLE' || ability.abilityType === slotTypeFromIndex(i, j))
				) {
					abilities[i][j] = ability.ability;
					return;
				}
			}
		}
	}
</script>

<div class="slots">
	{#each abilities as row, i}
		{#each row as item, j}
			{@const abilityType = abilityTypeFromName(item)}
			{@const slotType = slotTypeFromIndex(i, j)}
			<AbilitySlot
				ability={[
					{
						id: Math.floor(Math.random() * 10000000000).toString(),
						abilityType,
						ability: item
					}
				]}
				{slotType}
				ondrag={() => {}}
				onchange={(ability) => {
					abilities[i][j] = ability;
				}}
			/>
		{/each}
	{/each}
</div>

<AbilitySelector
	abilities={stackableAbilities}
	ondrag={() => {}}
	onclick={(ability) => addAbility(ability)}
/>
<AbilitySelector
	abilities={mainAbilities}
	ondrag={() => {}}
	onclick={(ability) => addAbility(ability)}
/>

<style>
	.slots {
		display: grid;
		grid-template-columns: repeat(4, fit-content(100%));
		gap: 1rem 0.5rem;
		align-items: center;
	}
</style>
