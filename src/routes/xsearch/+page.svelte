<script lang="ts">
	import Button from "$lib/components/button.svelte";
	import RadioGroup from "$lib/components/radio-group.svelte";
	import Select from "$lib/components/select.svelte";
	import Table from "$lib/components/table/table.svelte";

	let { data } = $props();

	$inspect(data);
</script>

<div class="flex flex-col gap-4">
	<div>
		<form>
			<RadioGroup
				name="mode"
				items={[
					{ id: "SZ", label: "Splat Zones" },
					{ id: "TC", label: "Tower Control" },
					{ id: "RM", label: "Rainmaker" },
					{ id: "CB", label: "Clam Blitz" },
				]}
			/>
			<RadioGroup
				name="division"
				items={[
					{ id: "TAKOROKA", label: "Takoroka" },
					{ id: "TENTATEK", label: "Tentatek" },
				]}
			/>
			<Select />
			<Button type="submit">Submit</Button>
		</form>
	</div>

	<Table />
</div>
