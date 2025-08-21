<script lang="ts">
	import type * as TeamAPI from '$lib/api/team';
	import Avatar from '$lib/components/Avatar.svelte';
	import WeaponImage from '$lib/components/image/WeaponImage.svelte';
	import { teamRoleTranslations } from '$lib/utils/i18n';
	import { userPage } from '$lib/utils/urls';

	interface Props {
		member: TeamAPI.queries.BySlugData['team']['members'][number];
		number: number;
	}

	const { member, number }: Props = $props();
</script>

<!-- Desktop -->
<div class="container" data-testid={member.isOwner ? `member-owner-${member.id}` : undefined}>
	{#if member.role}
		<span class="role" data-testid={`member-row-role-${number}`}>
			{teamRoleTranslations[member.role]()}
		</span>
	{/if}
	<div class="section">
		<a href={userPage(member)} class="avatar-name-container">
			<div class="avatar">
				<Avatar user={member} size="md" />
			</div>
			{member.username}
		</a>
		<div class="stack horizontal md">
			{#each member.weapons as { weaponSplId, isFavorite } (weaponSplId)}
				<WeaponImage
					variant={isFavorite ? 'badge-5-star' : 'badge'}
					{weaponSplId}
					width={48}
					height={48}
				/>
			{/each}
		</div>
	</div>
</div>

<!-- Mobile -->
<div class="card-container">
	<div class="card">
		<a href={userPage(member)} class="stack items-center">
			<Avatar user={member} size="md" />
			<div class="card-name">{member.username}</div>
		</a>
		{#if member.weapons.length > 0}
			<div class="stack horizontal md">
				{#each member.weapons as { weaponSplId, isFavorite } (weaponSplId)}
					<WeaponImage
						variant={isFavorite ? 'badge-5-star' : 'badge'}
						{weaponSplId}
						width={32}
						height={32}
					/>
				{/each}
			</div>
		{/if}
	</div>
	{#if member.role}
		<span class="role-mobile">
			{teamRoleTranslations[member.role]()}
		</span>
	{/if}
</div>

<style>
	.container {
		display: none;
		flex-direction: column;

		@media screen and (min-width: 640px) {
			display: flex;
		}
	}

	.section {
		background-color: var(--color-base-card);
		border-radius: var(--radius-box);
		padding: var(--s-2) var(--s-4);
		font-size: var(--fonts-xl);
		font-weight: var(--bold);
		display: flex;
		justify-content: space-between;
		align-items: center;
		height: 4.5rem;
	}

	.avatar-name-container {
		display: flex;
		align-items: center;
		gap: var(--s-4);
		color: var(--text);
		font-weight: var(--bold);
	}

	.avatar {
		background-color: var(--color-base-bg);
		padding: var(--s-2);
		border-radius: 100%;
	}

	.role {
		margin-left: auto;
		font-size: var(--fonts-sm);
		color: var(--color-base-content-secondary);
		margin-inline-end: var(--s-2-5);
		font-weight: var(--bold);
	}

	.role-mobile {
		color: var(--color-base-content-secondary);
		font-weight: var(--bold);
	}

	.card-container {
		width: 16rem;
		margin: 0 auto;
		display: flex;
		text-align: center;
		flex-direction: column;

		@media screen and (min-width: 640px) {
			display: none;
		}
	}

	a {
		color: var(--color-base-content);
	}

	.card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--s-2);
		padding: var(--s-3);
		background-color: var(--color-base-card);
		border-radius: var(--radius-box);
		font-size: var(--fonts-lg);
		font-weight: var(--bold);
	}

	.card-name {
		color: var(--text);
		font-weight: var(--bold);
		margin-block-start: var(--s-2);
	}
</style>
