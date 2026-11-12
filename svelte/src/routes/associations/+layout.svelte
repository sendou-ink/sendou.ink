<script lang="ts">
import { page } from "$app/state";
import { associationsSearchParams } from "~/features/associations/associations-search-params";
import {
	getAssociations,
	getAssociationToJoin,
} from "#lib/features/associations/associations.remote.ts";
import AssociationsPage from "#lib/features/associations/components/AssociationsPage.svelte";
import { getLoggedInUser } from "#lib/features/auth/auth.remote.ts";

let { children } = $props();

const inviteCode = $derived(
	associationsSearchParams.parse(new URLSearchParams(page.url.search))
		.inviteCode,
);
const user = $derived(await getLoggedInUser());
const associations = $derived(await getAssociations());
const toJoin = $derived(
	inviteCode ? await getAssociationToJoin(inviteCode) : null,
);
</script>

<svelte:head>
	<title>Associations | sendou.ink</title>
</svelte:head>

<AssociationsPage {associations} {toJoin} {inviteCode} {user}>
	{@render children()}
</AssociationsPage>
