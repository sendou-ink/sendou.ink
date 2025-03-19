<script lang="ts">
	import RadioGroup from "$lib/components/radio-group.svelte";
	import Select from "$lib/components/select.svelte";
	import Table from "$lib/components/table/table.svelte";
	import { SPL3_RANKED_MODES } from "$lib/schemas/spl3";

	let { data } = $props();

	let form: HTMLFormElement;

	let submitForm = () => {
		form.submit();
	};

	$inspect(data);
</script>

<!-- TODO: meta -->

<div class="flex flex-col gap-12">
	<div>
		<form class="flex flex-wrap gap-2" bind:this={form}>
			<RadioGroup
				name="mode"
				size="sm"
				items={SPL3_RANKED_MODES.map((mode) => ({ id: mode, label: mode }))}
				onChange={submitForm}
			/>
			<RadioGroup
				name="region"
				size="sm"
				items={[
					{ id: "JPN", label: "Takoroka" },
					{ id: "WEST", label: "Tentatek" },
				]}
				onChange={submitForm}
			/>
			<Select size="sm" options={data.seasonOptions} onChange={submitForm} name="season" />
		</form>
	</div>

	{#if data.entries}
		<Table data={data.entries}>
			{#snippet header()}
				<th></th>
				<th>Player</th>
				<th>Weapon</th>
				<th>Power</th>
			{/snippet}

			{#snippet row(player)}
				<td>{1}</td>
				<td>{player.name}</td>
				<td>{player.weaponSplId}</td>
				<td>{player.power}</td>
			{/snippet}
		</Table>
	{/if}
</div>
