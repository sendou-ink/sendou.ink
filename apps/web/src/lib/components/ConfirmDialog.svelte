<!--
@component
Confirmation flow for destructive or otherwise notable actions: renders a
caller-provided trigger that opens a dialog with a heading, an optional
description, and a confirm button running `onConfirm` (the dialog closes after
it resolves). Svelte counterpart of the React `FormWithConfirm`, adapted to
remote functions: instead of submitting hidden form fields, confirming runs the
given callback.
-->
<script lang="ts">
import { Button, Dialog } from "@sendou/components";
import type { ComponentProps } from "svelte";
import type { Snippet } from "svelte";
import FormMessage from "#lib/components/FormMessage.svelte";
import { m } from "#lib/paraglide/messages.js";

interface Props {
	/** Opens the dialog via the received `onclick`. Callers typically spread it on a button along with their own `data-testid`. */
	trigger: Snippet<[{ onclick: () => void; type: "button" }]>;
	dialogHeading: string;
	/** Optional explanatory text shown below the heading in the confirm dialog. */
	description?: string;
	/** Confirming runs this callback; the dialog closes once it resolves. */
	onConfirm: () => Promise<unknown> | void;
	submitButtonText?: string;
	submitButtonVariant?: ComponentProps<typeof Button>["variant"];
}

let {
	trigger,
	dialogHeading,
	description,
	onConfirm,
	submitButtonText,
	submitButtonVariant = "destructive",
}: Props = $props();

let open = $state(false);
let confirming = $state(false);

async function confirm() {
	confirming = true;
	try {
		await onConfirm();
	} finally {
		confirming = false;
		open = false;
	}
}
</script>

{@render trigger({
	onclick: () => {
		open = true;
	},
	type: "button",
})}

{#if open}
	<Dialog
		isDismissable
		onClose={() => {
			open = false;
		}}
	>
		<div class="stack md">
			<h2 class="text-md text-center">{dialogHeading}</h2>
			{#if description}
				<FormMessage type="info">{description}</FormMessage>
			{/if}
			<div class="stack horizontal md justify-center mt-2">
				<Button
					variant={submitButtonVariant}
					testId="confirm-button"
					disabled={confirming}
					onclick={confirm}
				>
					{submitButtonText ?? m.common_actions_delete()}
				</Button>
			</div>
		</div>
	</Dialog>
{/if}
