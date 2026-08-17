<script lang="ts">
import { Button, Dialog } from "@sendou/components";
import MatchPageHeader from "#lib/components/match-page/MatchPageHeader.svelte";
import { loggedInUser } from "#lib/features/auth/user-state.ts";
import FormField from "#lib/form/FormField.svelte";
import SendouForm from "#lib/form/SendouForm.svelte";
import { hasPermission } from "#lib/modules/permissions/utils.ts";
import { m } from "#lib/paraglide/messages.js";
import { databaseTimestampToDate } from "#lib/utils/dates.ts";
import * as Scrim from "../Scrim.ts";
import { cancelScrim, type ScrimPageData } from "../scrims.remote.ts";
import { cancelScrimFormSchema } from "../scrims-schemas.ts";

interface Props {
	data: ScrimPageData;
}

let { data }: Props = $props();

const user = $derived(loggedInUser());

const allowedToCancel = $derived(hasPermission(data.post, "CANCEL", user));
const isCanceled = $derived(Boolean(data.post.canceled));
const canCancel = $derived(
	allowedToCancel &&
		!isCanceled &&
		databaseTimestampToDate(data.post.startsAt) > new Date(),
);

const acceptedRequest = $derived(
	data.post.requests.find((r) => r.isAccepted),
);
const opponentSide = $derived.by(() => {
	const viewerSide = data.mapByMap.viewerSide;
	if (viewerSide === "ALPHA") return acceptedRequest;
	if (viewerSide === "BRAVO") return data.post;
	return acceptedRequest;
});

async function handleCancelSubmit(values: Record<string, unknown>) {
	await cancelScrim(
		values as { scrimPostId: number; reason: string },
	);
	return undefined;
}
</script>

<MatchPageHeader subtitle={m.scrims_page_scheduledScrim()}>
	{#snippet topRight()}
		{#if canCancel}
			<Dialog heading={m.scrims_cancelModal_scrim_title()} showCloseButton>
				{#snippet trigger(triggerProps)}
					<Button size="small" variant="minimal-destructive" {...triggerProps}>
						{m.common_actions_cancel()}
					</Button>
				{/snippet}
				<SendouForm
					schema={cancelScrimFormSchema}
					submitButtonTestId="cancel-scrim-submit"
					defaultValues={{ scrimPostId: data.post.id, reason: "" }}
					onSubmit={handleCancelSubmit}
				>
					<FormField name="reason" />
				</SendouForm>
			</Dialog>
		{/if}
	{/snippet}
	{#if opponentSide}
		{m.scrims_page_vs({ opponent: Scrim.sideDisplayName(opponentSide) })}
	{/if}
</MatchPageHeader>
