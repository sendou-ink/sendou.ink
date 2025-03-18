<script lang="ts">
	import type { Size } from "./types";

	interface RadioGroupProps {
		name: string;
		items: Array<{ id: string; label: string }>;
		size?: Size;
		onChange?: (id: string) => void;
	}

	let { name, items, size, onChange }: RadioGroupProps = $props();
</script>

<div class="join">
	{#each items as item (item.id)}
		<input
			class={[
				"join-item",
				"btn",
				"px-3",
				{
					"btn-xs": size === "xs",
					"btn-sm": size === "sm",
					"btn-lg": size === "lg",
					"btn-xl": size === "xl",
				},
			]}
			type="radio"
			{name}
			defaultChecked={item.id === items[0].id}
			aria-label={item.label}
			value={item.id}
			onchange={onChange ? () => onChange(item.id) : undefined}
		/>
	{/each}
</div>
