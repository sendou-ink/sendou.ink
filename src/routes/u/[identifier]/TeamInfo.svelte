<script lang="ts">
	import { resolve } from '$app/paths';
	import * as UserAPI from '$lib/api/user';
	import Popover from '$lib/components/popover/Popover.svelte';
	import PopoverTriggerButton from '$lib/components/popover/PopoverTriggerButton.svelte';
	import { teamRoleTranslations } from '$lib/utils/i18n';
	import { userSubmittedImage } from '$lib/utils/urls-img';

	interface Props {
		team: NonNullable<UserAPI.queries.ProfileByIdentifierData['team']>;
		secondaryTeams: UserAPI.queries.ProfileByIdentifierData['secondaryTeams'];
	}

	const { team, secondaryTeams }: Props = $props();
</script>

<div class="stack horizontal sm">
	<a
		href={resolve('/t/[slug]', { slug: team.customUrl })}
		class="team"
		data-testid="main-team-link"
	>
		{#if team.avatarUrl}
			<img
				alt=""
				src={userSubmittedImage(team.avatarUrl)}
				width="32"
				height="32"
				class="rounded-full"
			/>
		{/if}
		<div>
			{team.name}
			{#if team.userTeamRole}
				<div class="text-xxs text-lighter font-bold">
					{teamRoleTranslations[team.userTeamRole]()}
				</div>
			{/if}
		</div>
	</a>

	{#if secondaryTeams.length > 0}
		<Popover>
			{#snippet trigger()}
				<PopoverTriggerButton
					class="focus-text-decoration self-start"
					variant="minimal"
					size="small"
				>
					<span class="text-sm font-bold text-main-forced" data-testid="secondary-team-trigger">
						+{secondaryTeams.length}
					</span>
				</PopoverTriggerButton>
			{/snippet}

			<div class="stack sm">
				{#each secondaryTeams as team (team.customUrl)}
					<div class="stack horizontal md items-center">
						<a href={resolve('/t/[slug]', { slug: team.customUrl })} class="team text-main-forced">
							{#if team.avatarUrl}
								<img
									alt=""
									src={userSubmittedImage(team.avatarUrl)}
									width="24"
									height="24"
									class="rounded-full"
								/>
							{/if}
							{team.name}
						</a>
						{#if team.userTeamRole}
							<div class="text-xxs text-lighter font-bold">
								{teamRoleTranslations[team.userTeamRole]()}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</Popover>
	{/if}
</div>

<style>
	.team {
		display: flex;
		font-weight: var(--bold);
		color: var(--text);
		gap: var(--s-1-5);
		grid-area: team;
		align-items: center;
	}
</style>
