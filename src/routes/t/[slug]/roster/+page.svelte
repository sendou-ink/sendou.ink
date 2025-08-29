<script lang="ts">
	import { resolve } from '$app/paths';
	import InviteLink from '$lib/components/InviteLink.svelte';
	import GoBackButton from '../GoBackButton.svelte';
	import * as TeamAPI from '$lib/api/team';
	import RosterGrid from './RosterGrid.svelte';

	const { params } = $props();

	const team = $derived((await TeamAPI.queries.bySlug(params.slug)).team);
	const inviteCode = $derived(await TeamAPI.queries.inviteCodeBySlug(params.slug));
</script>

<div class="stack lg">
	<GoBackButton slug={params.slug} />

	<RosterGrid {team} />

	<InviteLink
		code={inviteCode}
		url={resolve('/t/[slug]', { slug: params.slug })}
		onReset={async () => await TeamAPI.actions.resetInviteCode(params.slug)}
		resetPending={TeamAPI.actions.resetInviteCode.pending > 0}
	/>
</div>
