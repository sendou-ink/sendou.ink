<script lang="ts">
import { page } from "$app/state";
import { getLoggedInUser } from "#lib/features/auth/auth.remote.ts";
import BracketsPage from "#lib/features/tournament-bracket/components/BracketsPage.svelte";
import { getTournamentBracketsPage } from "#lib/features/tournament-bracket/tournament-bracket.remote.ts";

const data = $derived(
	await getTournamentBracketsPage({
		tournamentId: Number(page.params.id),
		search: page.url.search,
	}),
);
const user = $derived(await getLoggedInUser());
</script>

<svelte:head>
	<title>{data.layout.tournament.ctx.name} | sendou.ink</title>
</svelte:head>

<BracketsPage {data} {user} />
