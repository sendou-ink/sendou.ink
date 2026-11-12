<script lang="ts">
import type { Snippet } from "svelte";
import { errorMessageId, infoMessageId } from "~/form/utils";
import FormMessage from "#lib/components/FormMessage.svelte";
import Label from "#lib/components/Label.svelte";
import { getSendouFormContext } from "../form-context.ts";

interface Props {
	id: string;
	name?: string;
	label?: string;
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
	required,
	error,
	bottomText,
	valueLimits,
	children,
}: Props = $props();

const { translate } = getSendouFormContext();

const translatedLabel = $derived(translate(label));
const translatedError = $derived(translate(error));
const translatedBottomText = $derived(translate(bottomText));
</script>

<div class="root">
	<div class="stack xs">
		{#if translatedLabel}
			<Label for={id} {required} {valueLimits} spaced={false}>
				{translatedLabel}
			</Label>
		{/if}
		{@render children()}
		{#if translatedError}
			<FormMessage
				type="error"
				spaced={false}
				id={name ? errorMessageId(name) : undefined}
			>
				{translatedError}
			</FormMessage>
		{/if}
		{#if translatedBottomText}
			<FormMessage
				type="info"
				spaced={false}
				id={name ? infoMessageId(name) : undefined}
			>
				{translatedBottomText}
			</FormMessage>
		{/if}
	</div>
</div>

<style>
	@layer features {
		.root {
			width: 100%;

			& :global(input:not([type="radio"], [type="checkbox"])),
			& :global(textarea),
			& :global(select) {
				width: 100%;
			}
		}
	}
</style>
