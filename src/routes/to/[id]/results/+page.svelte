<script lang="ts">
	import type { PageProps } from '../$types';
	import * as TournamentAPI from '$lib/api/tournament';
	import Table from '$lib/components/tables/Table.svelte';
	import Placement from '$lib/components/Placement.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import Flag from '$lib/components/Flag.svelte';
	import { resolve } from '$app/paths';
	import MatchResultSquare from './MatchResultSquare.svelte';
	import Popover from '$lib/components/popover/Popover.svelte';
	import PopoverTriggerButton from '$lib/components/popover/PopoverTriggerButton.svelte';

	const { params }: PageProps = $props();

	const results = $derived(await TournamentAPI.queries.resultsById(params.id));
</script>

{#if results.length > 0}
	<div>
		<Table>
			<thead>
				<tr>
					<th>Standing</th>
					<th>Team</th>
					<th>Roster</th>
					<th>Seed</th>
					{#if typeof results[0].spr === 'number'}
						<th class="stack horizontal sm items-center" data-testid="spr-header">
							SPR
							<Popover>
								{#snippet trigger()}
									<PopoverTriggerButton variant="popover">?</PopoverTriggerButton>
								{/snippet}
								<a
									href="https://web.archive.org/web/20250513034545/https://www.pgstats.com/articles/introducing-spr-and-uf"
									target="_blank"
									rel="noopener noreferrer"
									class="text-theme"
								>
									Seed Performance Rating
								</a>
							</Popover>
						</th>
					{/if}
					<th>Matches</th>
				</tr>
			</thead>
			<tbody>
				{#each results as result (result.team.id)}
					<tr class={result.placement ? 'bg-darker-transparent' : ''}>
						<td class="text-md">
							{#if typeof result.placement === 'number'}
								<Placement placement={result.placement} size={36} />
							{/if}
						</td>
						<td>
							<a
								href={resolve(`/to/${params.id}/teams/${result.team.id}`)}
								class="team-name"
								data-testid="result-team-name"
							>
								{#if result.teamLogoSrc}
									<Avatar size="xs" url={result.teamLogoSrc} />
								{/if}
								{result.team.name}
							</a>
						</td>
						<td>
							{#each result.team.members as player (player.userId)}
								<div class="stack xxs horizontal items-center">
									{#if player.country}
										<Flag countryCode={player.country} tiny />
									{/if}
									{player.username}
								</div>
							{/each}
						</td>
						<td class="text-sm">{result.team.seed}</td>
						{#if typeof result.spr === 'number'}
							<td class="text-sm">
								{result.spr > 0 ? '+' : ''}{result.spr}
							</td>
						{/if}
						<td>
							{@render matchHistoryRow()}
						</td>
					</tr>

					{#snippet matchHistoryRow()}
						<div class="stack horizontal xs">
							{#each result.matches as match, i (match.id)}
								{#if i !== 0 && result.matches[i - 1].bracketIdx !== match.bracketIdx}
									<div class="match-history-divider"></div>
								{/if}
								<MatchResultSquare
									result={match.result}
									href={resolve(`/to/[id]/matches/[mid]`, {
										id: params.id,
										mid: String(match.id)
									})}
								>
									{match.vsSeed}
								</MatchResultSquare>
							{/each}
						</div>
					{/snippet}
				{/each}
			</tbody>
		</Table>
	</div>
{:else}
	<div class="text-center text-lg font-semi-bold text-lighter">
		No team finished yet, check back later
	</div>
{/if}

<style>
	.team-name {
		min-width: 125px;
		word-break: break-word;
		display: flex;
		gap: var(--s-1-5);
		align-items: center;
		color: var(--text);
		color: var(--color-base-content);
	}

	.match-history-divider {
		width: 5px;
		background-color: var(--color-primary-transparent);
		border-radius: var(--radius-box);
	}
</style>
