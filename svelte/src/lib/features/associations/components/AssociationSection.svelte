<script lang="ts">
import { Trash } from "@lucide/svelte";
import * as Association from "~/features/associations/core/Association";
import { scrimsByAssociationPage } from "~/features/scrims/scrims-urls";
import { hasPermission } from "~/modules/permissions/utils";
import ActionForm from "#lib/components/ActionForm.svelte";
import Button from "#lib/components/Button.svelte";
import { m } from "#lib/paraglide/messages.js";
import {
	deleteAssociation,
	getAssociationToJoin,
	leaveAssociation,
} from "../associations.remote.ts";
import type {
	AssociationsPageAssociation,
	Viewer,
} from "../associations-types.ts";
import AssociationMember from "./AssociationMember.svelte";
import InviteCodeActions from "./InviteCodeActions.svelte";

interface Props {
	association: AssociationsPageAssociation;
	user: Viewer;
}

let { association, user }: Props = $props();

const members = $derived(association.members ?? []);
const canManage = $derived(hasPermission(association, "MANAGE", user));
const newAdmin = $derived(
	canManage ? Association.resolveNewAdmin(members) : null,
);
const adminUsername = $derived(
	members.find((member) => member.role === "ADMIN")?.username,
);
</script>

<section>
	<div class="stack horizontal sm items-center justify-between">
		<h2 class="text-lg">{association.name}</h2>
		{#if canManage}
			<ActionForm
				form={deleteAssociation.for(association.id)}
				fields={{ associationId: association.id }}
				confirm={{
					dialogHeading: m.scrims_associations_delete_title({
						name: association.name,
					}),
				}}
				shape="square"
				class="small-text"
				variant="minimal-destructive"
				testId="delete-association"
			>
				{#snippet icon(iconClass)}
					<Trash class="small-icon {iconClass}" />
				{/snippet}
			</ActionForm>
		{/if}
	</div>
	<div class="text-sm text-lighter">
		{m.scrims_associations_admin({ username: adminUsername ?? "" })}
	</div>
	<div class="stack horizontal sm items-center my-2">
		<!-- scrims are still served by the React app, so the link is a document navigation -->
		<Button
			href={scrimsByAssociationPage(association.id)}
			variant="outlined"
			size="small"
			data-sveltekit-reload
		>
			{m.scrims_associations_viewScrims()}
		</Button>
		{#if !canManage || newAdmin}
			<ActionForm
				form={leaveAssociation.for(association.id)}
				fields={{ associationId: association.id }}
				updates={[getAssociationToJoin]}
				confirm={{
					dialogHeading: newAdmin
						? m.scrims_associations_leave_titleWithNewAdmin({
								name: association.name,
								username: newAdmin.username,
							})
						: m.scrims_associations_leave_title({ name: association.name }),
					submitButtonText: m.scrims_associations_leave_action(),
				}}
				variant="minimal-destructive"
				size="small"
				testId="leave-team-button"
			>
				{m.scrims_associations_leave_action()}
			</ActionForm>
		{/if}
	</div>
	<div class="stack sm mt-4">
		{#each members as member (member.id)}
			<AssociationMember
				{member}
				associationId={association.id}
				canStar={canManage && member.id !== user?.id}
				{user}
			/>
		{/each}
	</div>
	{#if canManage}
		<div class="text-xs text-lighter mt-2">
			{m.scrims_associations_manager_explanation()}
		</div>
	{/if}
	{#if association.inviteCode}
		<InviteCodeActions
			associationId={association.id}
			inviteCode={association.inviteCode}
		/>
	{/if}
</section>
