<script lang="ts">
import { Check } from "@lucide/svelte";
import { Button, Popover } from "@sendou/components";
import ConfirmDialog from "#lib/components/ConfirmDialog.svelte";
import { dateTimeFormat } from "#lib/modules/intl/date-time-format.ts";
import { m } from "#lib/paraglide/messages.js";
import { databaseTimestampToDate } from "#lib/utils/dates.ts";
import { acceptScrimRequest, getScrimPosts } from "../scrims.remote.ts";
import type { ScrimPostRequest } from "../scrims-types.ts";
import ScrimCardShell from "./ScrimCardShell.svelte";
import ScrimExpandableText from "./ScrimExpandableText.svelte";
import ScrimTeamAvatar from "./ScrimTeamAvatar.svelte";
import ScrimTeamMembersPopover from "./ScrimTeamMembersPopover.svelte";

interface Props {
	request: ScrimPostRequest;
	postStartTime: number;
	canAccept: boolean;
	showFooter?: boolean;
}

let { request, postStartTime, canAccept, showFooter = true }: Props = $props();

const owner = $derived(
	request.users.find((user) => user.isOwner) ?? request.users[0],
);
const isPickup = $derived(!request.team?.name);
const teamName = $derived(request.team?.name ?? owner.username);

const confirmedTime = $derived(
	request.startsAt
		? databaseTimestampToDate(request.startsAt)
		: databaseTimestampToDate(postStartTime),
);

const formattedTime = $derived(
	dateTimeFormat({ hour: "numeric", minute: "2-digit" }).formatter.format(
		confirmedTime,
	),
);
</script>

<ScrimCardShell
	isRequestCard
	{isPickup}
	{teamName}
	ownerUsername={owner.username}
	footerClass="requestFooter"
	{showFooter}
>
	{#snippet avatar()}
		<ScrimTeamAvatar
			teamAvatarUrl={request.team?.avatarUrl}
			{teamName}
			{owner}
		/>
	{/snippet}
	{#snippet rightIcons()}
		<ScrimTeamMembersPopover users={request.users} />
	{/snippet}

	{#if request.message}
		<ScrimExpandableText text={request.message} />
	{/if}

	{#snippet footer()}
		{#if canAccept}
				<ConfirmDialog
					dialogHeading={m.scrims_acceptModal_title({ groupName: teamName })}
					description={m.scrims_autoCancelInfo()}
					submitButtonVariant="primary"
					submitButtonText={m.common_actions_confirm()}
					onConfirm={() =>
						acceptScrimRequest({ scrimPostRequestId: request.id }).updates(
							getScrimPosts,
						)}
				>
					{#snippet trigger(triggerProps)}
						<Button
							size="small"
							testId="confirm-modal-trigger-button"
							{...triggerProps}
						>
							{#snippet icon()}<Check />{/snippet}
							{m.scrims_acceptModal_confirmFor({ time: formattedTime })}
						</Button>
					{/snippet}
				</ConfirmDialog>
			{:else}
				<Popover>
					{#snippet trigger(triggerProps)}
						<Button size="small" {...triggerProps}>
							{m.scrims_acceptModal_confirmFor({ time: formattedTime })}
						</Button>
					{/snippet}
					{m.scrims_acceptModal_prevented()}
				</Popover>
		{/if}
	{/snippet}
</ScrimCardShell>
