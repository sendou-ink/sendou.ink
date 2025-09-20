<script lang="ts">
	import { resolve } from '$app/paths';
	import Avatar from '$lib/components/Avatar.svelte';
	import type * as TournamentAPI from '$lib/api/tournament';

	interface Props {
		team: TournamentAPI.queries.TeamsByIdData[number];
		tournamentId?: number;
	}

	let { team, tournamentId }: Props = $props();
</script>

<div class="container">
	<div class="name">
		<div class="stack horizontal sm justify-end items-end">
			{#if team.logoSrc}
				<Avatar size="xxs" url={team.logoSrc} />
			{/if}
			{#if team.seed}
				<div class="seed">#{team.seed}</div>
			{/if}
		</div>
		{#if tournamentId}
			<a
				href={resolve(`/t/${tournamentId}/teams/${team.id}`)}
				class="team-name"
				data-testid="team-name"
			>
				{team.name}
			</a>
		{:else}
			<span class="team-name">
				{team.name}
			</span>
		{/if}
	</div>
	<ul>
		{#each team.members as member (member.discordId)}
			<li>
				{#if member.isOwner}
					<span class="role text-theme">C</span>
				{/if}
				{#if member.isSub && !member.isOwner}
					<span class="role role-sub">S</span>
				{/if}
				<div class={['member', { 'member-inactive': member.isInactive }]}>
					<Avatar user={member} size="xxs" />
					<a
						href={resolve('/u/[identifier]', {
							identifier: member.customUrl ?? member.discordId
						})}
						class="member-name"
						data-testid="team-member-name"
					>
						{member.name}
					</a>
				</div>
			</li>
		{/each}
	</ul>
</div>

<style>
	.container {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		width: 100%;
		align-items: center;
	}

	.name {
		flex: 1;
		font-weight: var(--bold);
		padding-inline-end: var(--s-4);
		text-align: right;
	}

	ul {
		display: flex;
		flex: 1;
		flex-direction: column;
		border-inline-start: 2px solid var(--color-primary);
		font-size: var(--fonts-xs);
		font-weight: var(--semi-bold);
		gap: var(--s-2);
		padding-inline-start: var(--s-4);
		padding-block: var(--s-3);
	}

	li {
		list-style: none;
		position: relative;
	}

	.member {
		display: grid;
		gap: var(--s-1-5);
		grid-template-columns: max-content max-content 1fr;
	}

	.member-inactive {
		text-decoration: line-through;
		color: var(--text-lighter);
		text-decoration-thickness: 2px;
	}

	.seed {
		font-size: var(--fonts-xxs);
		font-weight: var(--semi-bold);
		color: var(--text-lighter);
	}

	.team-name {
		word-break: break-word;
		color: var(--color-primary);
	}

	.member-name {
		color: var(--text);
		margin: auto 0;

		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 30vw;
	}

	.role {
		position: absolute;
		background-color: var(--color-secondary);
		color: var(--color-primary-content);
		font-weight: var(--semi-bold);
		width: 12px;
		height: 12px;
		border-radius: 100%;
		font-size: var(--fonts-xxxxs);
		display: grid;
		place-items: center;
		top: 14px;
		left: 15px;
	}

	.role-sub {
		background-color: var(--theme-info);
	}
</style>
