<script lang="ts">
	import { getAllTeams, searchUsers } from './search.remote';
	import { searchUsersSchema } from './schemas';
	import { DebounceFunction } from '$lib/runes/debounce.svelte';
	import { SearchParamState } from '$lib/runes/search-param-state.svelte';

	const searchState = new SearchParamState({
		defaultValue: '',
		schema: searchUsersSchema,
		key: 'q'
	});

	const debounce = new DebounceFunction((input: string) => {
		searchState.update(input);
	}, 1000);

	const users = $derived(await searchUsers({ input: searchState.state, limit: 25 }));
</script>

<input
	type="search"
	oninput={(event) => debounce.run(event.currentTarget.value)}
	placeholder="Search users or teams"
/>

{#if users === null}
	<p>You need to be logged in to search users</p>
{:else if debounce.pending}
	<p>Searching...</p>
{:else}
	{#each users.users as user}
		<p>{user.username}</p>
	{/each}
{/if}
