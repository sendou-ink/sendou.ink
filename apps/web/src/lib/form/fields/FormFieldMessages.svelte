<script lang="ts">
import FormMessage from "#lib/components/FormMessage.svelte";
import { errorMessageId, infoMessageId, translateFormText } from "../form-utils.ts";

interface Props {
	name?: string;
	error?: string;
	bottomText?: string;
}

let { name, error, bottomText }: Props = $props();

const translatedError = $derived(translateFormText(error));
const translatedBottomText = $derived(translateFormText(bottomText));
</script>

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
