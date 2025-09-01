<script lang="ts">
	import * as CalendarAPI from '$lib/api/calendar';
	import * as AuthAPI from '$lib/api/auth';
	import OpenGraphMeta from '$lib/components/OpenGraphMeta.svelte';
	import { resolveBaseUrl, userPage } from '$lib/utils/urls';
	import Main from '$lib/components/layout/Main.svelte';
	import { getLocale } from '$lib/paraglide/runtime';
	import { m } from '$lib/paraglide/messages';
	import Tags from '../Tags.svelte';
	import Button from '$lib/components/buttons/Button.svelte';
	import { hasPermission } from '$lib/modules/permissions/utils';
	import { resolve } from '$app/paths';
	import SquarePen from '@lucide/svelte/icons/square-pen';
	import Trophy from '@lucide/svelte/icons/trophy';
	import Map from '@lucide/svelte/icons/map';
	import Info from '@lucide/svelte/icons/info';
	import Tabs from '$lib/components/tabs/Tabs.svelte';
	import TabPanel from '$lib/components/tabs/TabPanel.svelte';
	import { SearchParamState } from '$lib/runes/search-param-state.svelte';
	import z from 'zod';
	import Table from '$lib/components/Table.svelte';
	import Placement from '$lib/components/Placement.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import { modesShort } from '$lib/constants/in-game/modes';
	import ModeMapPoolPicker from '$lib/components/ModeMapPoolPicker.svelte';
	import { confirmAction } from '$lib/utils/form';
	import * as MapPool from '$lib/core/maps/MapPool';

	const { params } = $props();

	const { event, results } = $derived(await CalendarAPI.queries.byId(params.id));
	const user = await AuthAPI.queries.me();

	const tabState = new SearchParamState({
		defaultValue: 'description',
		schema: z.enum(['description', 'results', 'mapPool']),
		key: 'tab'
	});
</script>

<OpenGraphMeta
	title={event.name}
	description={event.description ??
		`Splatoon competitive event hosted on ${resolveBaseUrl(event.bracketUrl)}`}
/>

<Main class="stack lg">
	<section class="stack sm">
		<div class="times">
			{#each event.startTimes as startTime, i (startTime.getTime())}
				<span
					class={[
						'text-lighter',
						{
							hidden: event.startTimes.length === 1
						}
					]}
				>
					{m.calendar_day({ number: i + 1 })}
				</span>
				<time dateTime={startTime.toISOString()}>
					{startTime.toLocaleDateString(getLocale(), {
						hour: 'numeric',
						minute: 'numeric',
						day: 'numeric',
						month: 'long',
						weekday: 'long',
						year: 'numeric'
					})}
				</time>
			{/each}
		</div>
		<div class="stack md">
			<div class="stack xs">
				<h2>{event.name}</h2>
				<Tags tags={event.tags} />
			</div>
			<div class="stack horizontal sm flex-wrap">
				{#if event.discordUrl}
					<Button href={event.discordUrl} variant="outlined" size="small">Discord</Button>
				{/if}
				<Button href={event.bracketUrl} variant="outlined" size="small">
					{resolveBaseUrl(event.bracketUrl)}
				</Button>
				{#if hasPermission(event, 'EDIT', user)}
					<Button
						icon={SquarePen}
						size="small"
						href={resolve('/calendar/new') + `?id=${event.eventId}`}
					>
						{m.common_actions_edit()}
					</Button>
					<Button
						icon={Trophy}
						size="small"
						href={resolve('/calendar/[id]/report-winners', { id: String(event.eventId) })}
					>
						{m.calendar_actions_reportWinners()}
					</Button>
				{/if}
			</div>
		</div>
	</section>
	<Tabs
		bind:value={() => tabState.state, (value) => tabState.update(value)}
		triggers={[
			{ label: m.common_forms_description(), value: 'description', icon: Info },
			{
				label: m.tournament_tabs_results(),
				value: 'results',
				icon: Trophy,
				hidden: !results.length
			},
			{
				label: m.calendar_forms_mapPool(),
				value: 'mapPool',
				icon: Map,
				hidden: !event.mapPool || MapPool.isEmpty(event.mapPool)
			}
		]}
	>
		<TabPanel value="description">{@render description()}</TabPanel>
		<TabPanel value="results">{@render eventResults()}</TabPanel>
		<TabPanel value="mapPool">{@render mapPool()}</TabPanel>
	</Tabs>
	<div class="stack md">
		{#if hasPermission(event, 'EDIT', user)}
			<Button
				class="ml-auto"
				size="small"
				variant="minimal-destructive"
				type="submit"
				onclick={() =>
					confirmAction(() => CalendarAPI.actions.deleteById(event.eventId), {
						title: m.calendar_actions_delete_confirm({ name: event.name }),
						redirectTo: resolve('/calendar')
					})}
			>
				{m.calendar_actions_delete()}
			</Button>
		{/if}
	</div>
</Main>

{#snippet description()}
	<div class="stack sm">
		<span class="text-lighter font-bold text-xs">{m.odd_every_pig_wish()}</span>
		<a href={userPage(event)} class="author">
			<Avatar user={event} size="xxs" />
			{event.username}
		</a>
		{#if event.description}
			<div class="whitespace-pre-wrap">{event.description}</div>
		{/if}
	</div>
{/snippet}

{#snippet eventResults()}
	{@const isTeamResults = results.some((result) => result.players.length > 1)}
	<div class="stack md">
		{#if event.participantCount}
			<div class="participant-count">
				{#if isTeamResults}
					{m.calendar_participatedCount({ count: event.participantCount })}
				{:else}
					{m.calendar_participatedPlayerCount({ count: event.participantCount })}
				{/if}
			</div>
		{/if}
		<Table>
			<thead>
				<tr>
					<th>{m.calendar_forms_team_placing()}</th>
					<th>{m.common_forms_name()}</th>
					<th>{m.calendar_members()}</th>
				</tr>
			</thead>
			<tbody>
				{#each results as result (result.id)}
					<tr>
						<td class="pl-4">
							<Placement placement={result.placement} />
						</td>
						<td>{result.teamName}</td>
						<td>
							<ul class="players">
								{#each result.players as player (player.id || player.name)}
									<li class="flex items-center">
										{#if player.name}
											{player.name}
										{:else}
											<a
												href={userPage(player as { discordId: string; customUrl: string | null })}
												class="stack horizontal xs items-center"
											>
												<Avatar
													user={player as { discordId: string; discordAvatar: string | null }}
													size="xxs"
												/>
												{player.username}
											</a>
										{/if}
									</li>
								{/each}
							</ul>
						</td>
					</tr>
				{/each}
			</tbody>
		</Table>
	</div>{/snippet}

<!-- xxx: generate map list link -->
{#snippet mapPool()}
	<div class="stack lg">
		{#each modesShort as mode (mode)}
			{@const pool = event.mapPool?.[mode]}
			{#if pool && pool.length > 0}
				<ModeMapPoolPicker {mode} {pool} presentational />
			{/if}
		{/each}
	</div>
{/snippet}

<style>
	.times {
		display: grid;
		column-gap: var(--s-1-5);
		font-weight: var(--semi-bold);
		grid-template-columns: max-content 1fr;
	}

	time {
		height: 1.25rem;
	}

	.author {
		display: flex;
		align-items: center;
		color: var(--text-lighter);
		font-weight: var(--semi-bold);
		gap: var(--s-2);
	}

	.participant-count {
		color: var(--color-base-content-secondary);
		font-size: var(--fonts-xs);
	}

	.players {
		display: flex;
		flex-wrap: wrap;
		padding: 0;
		gap: var(--s-3);
		list-style: none;

		a {
			color: var(--color-primary);
			font-weight: var(--semi-bold);
		}
	}
</style>
