<script lang="ts">
	import RadioGroup from "$lib/components/radio-group.svelte";
	import Select from "$lib/components/select.svelte";
	import Table from "$lib/components/table/table.svelte";

	let { data } = $props();

	let form: HTMLFormElement;

	let submitForm = () => {
		form.submit();
	};

	$inspect(data);
</script>

<div class="flex flex-col gap-4">
	<div>
		<form class="flex flex-wrap gap-2" bind:this={form}>
			<RadioGroup
				name="mode"
				size="sm"
				items={[
					{ id: "SZ", label: "Splat Zones" },
					{ id: "TC", label: "Tower Control" },
					{ id: "RM", label: "Rainmaker" },
					{ id: "CB", label: "Clam Blitz" },
				]}
				onChange={submitForm}
			/>
			<RadioGroup
				name="division"
				size="sm"
				items={[
					{ id: "TAKOROKA", label: "Takoroka" },
					{ id: "TENTATEK", label: "Tentatek" },
				]}
				onChange={submitForm}
			/>
			<Select size="sm" options={data.seasonOptions} onChange={submitForm} />
		</form>
	</div>

	<Table
		data={[
			{ name: "apples", qty: 5, price: 2 },
			{ name: "bananas", qty: 10, price: 1 },
			{ name: "cherries", qty: 20, price: 0.5 },
		]}
	>
		{#snippet header()}
			<th></th>
			<th>Player</th>
			<th>Weapon</th>
			<th>Power</th>
		{/snippet}

		{#snippet row(d)}
			<td>{d.name}</td>
			<td>{d.qty}</td>
			<td>{d.price}</td>
			<td>{d.qty * d.price}</td>
		{/snippet}
	</Table>
</div>
