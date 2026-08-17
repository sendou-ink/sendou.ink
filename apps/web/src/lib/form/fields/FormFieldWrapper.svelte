<script lang="ts">
import type { Snippet } from "svelte";
import Label from "#lib/components/Label.svelte";
import { translateFormText } from "../form-utils.ts";
import FormFieldMessages from "./FormFieldMessages.svelte";

interface Props {
	id: string;
	name?: string;
	label?: string;
	/** Extra element rendered next to the label, e.g. an info popover explaining the field's syntax. */
	labelPopover?: Snippet;
	required?: boolean;
	error?: string;
	bottomText?: string;
	valueLimits?: { current: number; max: number };
	children: Snippet;
}

let {
	id,
	name,
	label,
	labelPopover,
	required,
	error,
	bottomText,
	valueLimits,
	children,
}: Props = $props();

const translatedLabel = $derived(translateFormText(label));
</script>

{#snippet labelElement()}
	<Label htmlFor={id} {required} {valueLimits} spaced={false}>
		{translatedLabel}
	</Label>
{/snippet}

<div class="root">
	<div class="stack xs">
		{#if translatedLabel && labelPopover}
			<div class="stack horizontal xs items-center">
				{@render labelElement()}
				{@render labelPopover()}
			</div>
		{:else if translatedLabel}
			{@render labelElement()}
		{/if}
		{@render children()}
		<FormFieldMessages {name} {error} {bottomText} />
	</div>
</div>

<style>
	.root {
		width: 100%;

		& :global(input:not([type="radio"], [type="checkbox"])),
		& :global(textarea),
		& :global(select) {
			width: 100%;
		}
	}
</style>
