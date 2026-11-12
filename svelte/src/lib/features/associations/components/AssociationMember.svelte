<script lang="ts">
import { Star, Trash } from "@lucide/svelte";
import { hasPermission } from "~/modules/permissions/utils";
import ActionForm from "#lib/components/ActionForm.svelte";
import UserLink from "#lib/components/UserLink.svelte";
import { m } from "#lib/paraglide/messages.js";
import {
	addManager,
	removeManager,
	removeMember,
} from "../associations.remote.ts";
import type { AssociationsPageMember, Viewer } from "../associations-types.ts";

interface Props {
	member: AssociationsPageMember;
	associationId: number;
	canStar: boolean;
	user: Viewer;
}

let { member, associationId, canStar, user }: Props = $props();

const canRemove = $derived(hasPermission(member, "REMOVE", user));
const isManager = $derived(member.role === "MANAGER");
const formKey = $derived(`${associationId}-${member.id}`);
const fields = $derived({ associationId, userId: member.id });
</script>

<div class="stack horizontal sm items-center justify-between">
	<div class="stack horizontal sm items-center">
		<UserLink user={member} />
		{#if !canStar && isManager}
			<Star
				class="small-icon"
				fill="currentColor"
				role="img"
				aria-label={m.scrims_associations_manager_label()}
			/>
		{/if}
	</div>
	{#if canStar || canRemove}
		<div class="stack horizontal sm items-center">
			{#if canStar}
				<ActionForm
					form={(isManager ? removeManager : addManager).for(formKey)}
					{fields}
					shape="square"
					variant="minimal"
					size="small"
					class="small-text"
					aria-label={isManager
						? m.scrims_associations_manager_remove({
								username: member.username,
							})
						: m.scrims_associations_manager_add({ username: member.username })}
				>
					{#snippet icon(iconClass)}
						<Star
							class="small-icon {iconClass}"
							fill={isManager ? "currentColor" : "none"}
						/>
					{/snippet}
				</ActionForm>
			{/if}
			{#if canRemove}
				<ActionForm
					form={removeMember.for(formKey)}
					{fields}
					confirm={{
						dialogHeading: m.scrims_associations_removeMember_title({
							username: member.username,
						}),
						submitButtonText: m.common_actions_remove(),
					}}
					shape="square"
					class="small-text"
					variant="minimal-destructive"
					size="small"
				>
					{#snippet icon(iconClass)}
						<Trash class="small-icon {iconClass}" />
					{/snippet}
				</ActionForm>
			{/if}
		</div>
	{/if}
</div>
