<script lang="ts">
import type { Snippet } from "svelte";
import ActionForm from "#lib/components/ActionForm.svelte";
import Label from "#lib/components/Label.svelte";
import Main from "#lib/components/Main.svelte";
import { m } from "#lib/paraglide/messages.js";
import {
	getAssociationToJoin,
	joinAssociation,
} from "../associations.remote.ts";
import type {
	AssociationsPageAssociation,
	Viewer,
} from "../associations-types.ts";
import AssociationSection from "./AssociationSection.svelte";

interface Props {
	associations: AssociationsPageAssociation[];
	toJoin: { name: string } | null;
	inviteCode: string | null;
	user: Viewer;
	children?: Snippet;
}

let { associations, toJoin, inviteCode, user, children }: Props = $props();
</script>

<Main class="stack lg">
	{@render children?.()}
	<div class="stack sm">
		<div>
			<h1 class="text-xl">{m.scrims_associations_title()}</h1>
			<div class="text-sm text-lighter">
				{m.scrims_associations_explanation()}
			</div>
		</div>
	</div>
	{#if toJoin && inviteCode}
		<div class="stack horizontal md items-center">
			<Label spaced={false}>
				{m.scrims_associations_join_title({ name: toJoin.name })}
			</Label>
			<ActionForm
				form={joinAssociation}
				fields={{ inviteCode }}
				updates={[getAssociationToJoin]}
				size="small"
			>
				{m.common_actions_join()}
			</ActionForm>
		</div>
	{/if}
	{#each associations as association (association.id)}
		<AssociationSection {association} {user} />
	{/each}
</Main>
