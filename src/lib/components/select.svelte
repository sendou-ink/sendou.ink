<script lang="ts">
	import type { Size } from "$lib/components/types";

	interface SelectProps {
		size?: Size;
		/** Placeholder text that prompts user to pick an option (renders a disabled option)*/
		placeholder?: string;
		options: Array<{
			value: string;
			label: string;
		}>;
		onChange?: (value: string) => void;
		name?: string;
	}

	let { size, placeholder, options, onChange, name }: SelectProps = $props();
</script>

<select
	{name}
	class={[
		"select",
		{
			"select-xs": size === "xs",
			"select-sm": size === "sm",
			"select-lg": size === "lg",
			"select-xl": size === "xl",
		},
	]}
	onchange={onChange ? (e) => onChange(e.currentTarget.value) : undefined}
>
	{#if placeholder}
		<option disabled selected>{placeholder}</option>
	{/if}
	{#each options as option (option.value)}
		<option value={option.value}>{option.label}</option>
	{/each}
</select>
