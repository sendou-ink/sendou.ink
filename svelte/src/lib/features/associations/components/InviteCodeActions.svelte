<script lang="ts">
import { Check, Clipboard } from "@lucide/svelte";
import { associationsPage } from "~/features/associations/associations-urls";
import ActionForm from "#lib/components/ActionForm.svelte";
import Button from "#lib/components/Button.svelte";
import { m } from "#lib/paraglide/messages.js";
import { refreshInviteCode } from "../associations.remote.ts";

const COPY_SUCCESS_DURATION_MS = 2000;

interface Props {
	associationId: number;
	inviteCode: string;
}

let { associationId, inviteCode }: Props = $props();

const id = $props.id();

const inviteLink = $derived(
	`https://sendou.ink${associationsPage(inviteCode)}`,
);

let copySuccess = $state(false);

async function copyToClipboard() {
	try {
		await navigator.clipboard.writeText(inviteLink);
	} catch {
		return;
	}

	copySuccess = true;
	setTimeout(() => {
		copySuccess = false;
	}, COPY_SUCCESS_DURATION_MS);
}
</script>

<div class="mt-6">
	<label for={id}>{m.scrims_associations_shareLink_title()}</label>
	<div class="stack horizontal sm items-center">
		<input type="text" value={inviteLink} readonly {id} />
		<Button
			shape="square"
			variant={copySuccess ? "outlined-success" : "outlined"}
			onclick={copyToClipboard}
			aria-label="Copy to clipboard"
		>
			{#snippet icon(iconClass)}
				{#if copySuccess}
					<Check class={iconClass} />
				{:else}
					<Clipboard class={iconClass} />
				{/if}
			{/snippet}
		</Button>
	</div>
	<ActionForm
		form={refreshInviteCode.for(associationId)}
		fields={{ associationId }}
		variant="minimal-destructive"
		size="small"
	>
		{m.scrims_associations_shareLink_reset()}
	</ActionForm>
</div>
