<script lang="ts" generics="T">
	import type { Snippet } from "svelte";

	let {
		data,
		header,
		row,
	}: {
		data: T[];
		header: Snippet;
		row: Snippet<[T]>;
	} = $props();
</script>

<div class="rounded-box border-base-content/5 bg-base-200 overflow-x-auto border">
	<table class="bg-base-200 table">
		<thead>
			<tr>
				{@render header()}
			</tr>
		</thead>
		<tbody>
			{#each data as item}
				<tr>
					{@render row(item)}
				</tr>
			{/each}
		</tbody>
	</table>
</div>
