<script lang="ts">
	let { name, items }: { name: string; items: Array<{ id: string; label: string }> } = $props();
</script>

<div class="join">
	{#each items as item (item.id)}
		<input
			class="join-item btn btn-sm px-3"
			type="radio"
			{name}
			defaultChecked={item.id === items[0].id}
			aria-label={item.label}
			value={item.id}
		/>
	{/each}
</div>
