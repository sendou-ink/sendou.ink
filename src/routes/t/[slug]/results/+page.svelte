<script lang="ts">
	import Main from '$lib/components/layout/Main.svelte';
	import { m } from '$lib/paraglide/messages';
	import GoBackButton from '../GoBackButton.svelte';
	import * as TeamAPI from '$lib/api/team';
	import { getLocale } from '$lib/paraglide/runtime';
	import Placement from '$lib/components/Placement.svelte';
	import Table from '$lib/components/Table.svelte';
	import { userSubmittedImage } from '$lib/utils/urls-img';
	import { resolve } from '$app/paths';
	import Popover from '$lib/components/popover/Popover.svelte';
	import PopoverTriggerButton from '$lib/components/popover/PopoverTriggerButton.svelte';
	import BookUser from '@lucide/svelte/icons/book-user';
	import Avatar from '$lib/components/Avatar.svelte';

	const { params } = $props();

	const { results } = $derived(await TeamAPI.queries.resultsBySlug(params.slug));
</script>

<Main class="stack lg">
	<GoBackButton slug={params.slug} />
	{@render resultsTable()}
</Main>

{#snippet resultsTable()}
	<Table>
		<thead>
			<tr>
				<th>{m.user_results_placing()}</th>
				<th>{m.user_results_date()}</th>
				<th>{m.user_results_tournament()}</th>
				<th>{m.user_results_subs()}</th>
			</tr>
		</thead>
		<tbody>
			{#each results as result (result.tournamentId)}
				{@const logoUrl = result.logoUrl ? userSubmittedImage(result.logoUrl) : ''}
				<!-- HACKY_resolvePicture({ name: result.tournamentName })} // xxx: no more HACKY -->
				<tr>
					<td class="pl-4 whitespace-nowrap">
						<div class="stack horizontal xs items-end">
							<Placement placement={result.placement} />
							<div class="text-lighter">
								/ {result.participantCount}
							</div>
						</div>
					</td>
					<td class="whitespace-nowrap">
						{result.startTime.toLocaleDateString(getLocale(), {
							day: 'numeric',
							month: 'short',
							year: 'numeric'
						})}
					</td>
					<td>
						<div class="stack horizontal xs items-center">
							<!-- xxx: if -->
							<!-- {#if logoUrl !== tournamentLogoUrl('default')}
								<img src={logoUrl} alt="" width={18} height={18} class="rounded-full" />
							{/if} -->
							<img src={logoUrl} alt="" width={18} height={18} class="rounded-full" />
							<a
								href={resolve(`/to/${result.tournamentId}/teams/${result.tournamentTeamId}`)}
								class="text-main"
							>
								{result.tournamentName}
							</a>
						</div>
					</td>
					<td>
						{#if result.subs.length > 0}
							<div class="stack horizontal md items-center">
								<Popover>
									{#snippet trigger()}
										<PopoverTriggerButton icon={BookUser} size="small" variant="minimal">
											{result.subs.length}
										</PopoverTriggerButton>
									{/snippet}

									<ul>
										{#each result.subs as player (player.id)}
											<li class="flex items-center">
												<a
													href={resolve('/u/[identifier]', {
														identifier: player.customUrl ?? player.discordId
													})}
													class="stack horizontal xs items-center text-main"
												>
													<Avatar user={player} size="xxs" />
													{player.username}
												</a>
											</li>
										{/each}
									</ul>
								</Popover>
							</div>
						{/if}
					</td>
				</tr>
			{/each}
		</tbody>
	</Table>
{/snippet}

<style>
	ul {
		display: flex;
		flex-direction: column;
		padding: 0;
		gap: var(--s-3);
		list-style: none;
	}
</style>
