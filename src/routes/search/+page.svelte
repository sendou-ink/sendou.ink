<script lang="ts">
	import type { UserSearchData, AllTeamsData } from '$lib/api/search/queries.remote';
	import { DebounceFunction } from '$lib/runes/debounce.svelte';
	import { SearchParamState } from '$lib/runes/search-param-state.svelte';
	import * as SearchAPI from '$lib/api/search';
	import z from 'zod';
	import User from '@lucide/svelte/icons/user';
	import Users from '@lucide/svelte/icons/users';
	import Trophy from '@lucide/svelte/icons/trophy';
	import Input from '$lib/components/Input.svelte';
	import Main from '$lib/components/layout/Main.svelte';
	import Tabs from '$lib/components/tabs/Tabs.svelte';
	import TabPanel from '$lib/components/tabs/TabPanel.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import AddNewButton from '$lib/components/buttons/AddNewButton.svelte';

	const tab = new SearchParamState({
		defaultValue: 'users',
		schema: z.enum(['users', 'teams', 'tournaments']),
		key: 'tab'
	});

	const searchState = new SearchParamState({
		defaultValue: '',
		schema: SearchAPI.schemas.searchUsersSchema,
		key: 'q'
	});

	const debounce = new DebounceFunction((input: string) => {
		searchState.update(input);
	}, 1000);

	const usersPromise = $derived.by(() => {
		if (tab.state !== 'users' || searchState.state === '') return Promise.resolve(null);
		return SearchAPI.queries.searchUsers({ input: searchState.state, limit: 25 });
	});
	const usersResult = $derived(await usersPromise);

	let search = $state(searchState.state);

	const teamsResult = $derived(await SearchAPI.queries.getAllTeams());
	const filteredTeams = $derived.by(() => {
		if (tab.state !== 'teams') return teamsResult.teams;

		return teamsResult.teams.filter((team) =>
			team.name.toLowerCase().includes(search.toLowerCase())
		);
	});
</script>

<!-- xxx: i18n -->
<Main>
	<div class="input-container">
		<Input
			bind:value={search}
			type="search"
			oninput={(event) => {
				const value = event.currentTarget.value.toLowerCase();
				value ? debounce.run(value) : (debounce.cancel(), searchState.update(''));
			}}
		/>
		{#if tab.state === 'teams'}
			<AddNewButton navIcon="t" href="/t?new='true'" />
		{:else if tab.state === 'tournaments'}
			<AddNewButton navIcon="calendar" href="/calendar/new" />
		{/if}
	</div>

	<Tabs
		bind:value={() => tab.state, (value) => tab.update(value)}
		triggers={[
			{ label: 'Users', value: 'users', icon: User },
			{ label: 'Teams', value: 'teams', icon: Users },
			{ label: 'Tournaments', value: 'tournaments', icon: Trophy }
		]}
	>
		<TabPanel value="users">{@render usersList(usersResult)}</TabPanel>
		<TabPanel value="teams">{@render teamsList(filteredTeams)}</TabPanel>
		<TabPanel value="tournaments">Tournaments</TabPanel>
	</Tabs>
</Main>

{#snippet usersList(users: UserSearchData | null)}
	{#if users === undefined}
		<p>You need to be logged in to search users</p>
	{:else if users !== null}
		{#each users as user}
			<p>{user.username}</p>
		{/each}
	{/if}
{/snippet}

{#snippet teamsList(teams: AllTeamsData['teams'])}
	{#each teams as team}
		<p>{team.name}</p>
	{/each}
{/snippet}

<style>
	.input-container {
		margin-block: var(--s-6);
		display: grid;
		grid-template-columns: 1fr auto;
		gap: var(--s-4);
		align-items: center;
	}
</style>
