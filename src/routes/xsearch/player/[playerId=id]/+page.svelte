<script lang="ts">
	import Table from "$lib/components/table/table.svelte";
	import { userPageUrl } from "$lib/utils/urls";

	let { data } = $props();
</script>

<div>
	<h2 class="text-lg">
		{#if data.user}
			<a href={userPageUrl(data.user)}>{data.user}</a>
		{:else}
			{data.names.primary}
		{/if}
		placements
	</h2>
	{#if data.names.aliases.length > 0}
		<div class="text-lighter text-sm">
			aliases {data.names.aliases}
		</div>
	{/if}
</div>

<Table data={data.entries}>
	{#snippet header()}
		<th></th>
		<th>Division</th>
		<th>Mode</th>
		<th>Weapon</th>
		<th>Season</th>
		<th>Power</th>
	{/snippet}

	{#snippet row(entry)}
		<td>{entry.rank}</td>
		<td>{entry.region}</td>
		<td>{entry.mode}</td>
		<td>{entry.weaponSplId}</td>
		<td>{entry.season}</td>
		<td>{entry.power}</td>
	{/snippet}
</Table>
