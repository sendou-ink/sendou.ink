<script lang="ts">
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
	import { resolve } from '$app/paths';
	import Pagination from '$lib/components/Pagination.svelte';

	const tabState = new SearchParamState({
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
		if (tabState.state !== 'users' || searchState.state === '') return Promise.resolve(null);
		return SearchAPI.queries.searchUsers({ input: searchState.state, limit: 25 });
	});
	const usersResult = $derived(await usersPromise);

	let search = $derived(searchState.state);

	const teamsResult = $derived(await SearchAPI.queries.getAllTeams());
	const filteredTeams = $derived.by(() => {
		if (tabState.state !== 'teams') return teamsResult.teams;

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

				if (value) {
					debounce.run(value);
				} else {
					debounce.cancel();
					searchState.update('');
				}
			}}
		/>
		{#if tabState.state === 'teams'}
			<AddNewButton navIcon="t" href="/t?new='true'" />
		{:else if tabState.state === 'tournaments'}
			<AddNewButton navIcon="calendar" href="/calendar/new" />
		{/if}
	</div>

	<Tabs
		bind:value={() => tabState.state, (value) => tabState.update(value)}
		triggers={[
			{ label: 'Users', value: 'users', icon: User },
			{ label: 'Teams', value: 'teams', icon: Users },
			{ label: 'Tournaments', value: 'tournaments', icon: Trophy }
		]}
	>
		<TabPanel value="users">{@render usersList()}</TabPanel>
		<TabPanel value="teams">{@render teamsList()}</TabPanel>
		<TabPanel value="tournaments">Tournaments</TabPanel>
	</Tabs>
</Main>

{#snippet usersList()}
	{#if usersResult === undefined}
		<p>You need to be logged in to search users</p>
	{:else if usersResult !== null}
		<ul>
			{#each usersResult as user (user.id)}
				<li>
					<a
						class="link-item"
						href={resolve('/u/[identifier]', {
							identifier: user.customUrl ?? user.discordId
						})}
					>
						<Avatar {user} size="sm" />
						<div class="item-info">
							<p>{user.username}</p>
							<p>IGN: {user.inGameName}</p>
						</div>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
{/snippet}

{#snippet teamsList()}
	<Pagination items={filteredTeams} pageSize={25}>
		{#snippet child({ items })}
			<ul>
				{#each items as team (team.customUrl)}
					<li>
						<a href={resolve('/t/[slug]', { slug: team.customUrl })} class="link-item">
							<Avatar url={team.avatarSrc ?? ''} size="sm" />
							<div class="item-info">
								<p>{team.name}</p>
								<p>{team.members.map((member) => member.username).join(', ')}</p>
							</div>
						</a>
					</li>
				{/each}
			</ul>
		{/snippet}
	</Pagination>
{/snippet}

<style>
	.input-container {
		--field-width-medium: 100%;

		margin-block: var(--s-6);
		display: grid;
		grid-template-columns: 1fr auto;
		gap: var(--s-4);
		align-items: center;
	}

	.link-item {
		display: flex;
		gap: var(--s-4);
		align-items: center;

		.item-info :last-child {
			color: var(--color-base-content-secondary);
			font-size: var(--fonts-xs);
		}
	}

	li {
		list-style: none;
	}

	ul {
		margin-block: var(--s-4) var(--s-8);
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--s-4);
	}

	a {
		color: initial;
	}
</style>
