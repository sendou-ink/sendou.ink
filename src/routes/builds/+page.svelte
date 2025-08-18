<script lang="ts">
	import OpenGraphMeta from '$lib/components/OpenGraphMeta.svelte';
	import AddNewButton from '$lib/components/buttons/AddNewButton.svelte';
	import { asset, resolve } from '$app/paths';
	import { weaponCategories, weaponIdIsNotAlt } from '$lib/constants/in-game/weapon-ids';
	import Main from '$lib/components/layout/Main.svelte';
	import { weaponCategoryTranslations, weaponTranslations } from '$lib/utils/i18n';
	import type { MainWeaponId } from '$lib/constants/in-game/types';
	import * as AuthAPI from '$lib/api/auth';
	import { weaponBuildPage } from '$lib/utils/urls';

	const user = $derived(await AuthAPI.queries.me());
</script>

<OpenGraphMeta
	title="Builds"
	ogTitle="Splatoon 3 builds for all weapons"
	description="View Splatoon 3 builds for all weapons by the best players. Includes collection of user submitted builds and an aggregation of ability stats."
/>

<Main class="stack md">
	{#if user}
		<div class="stack items-end">
			<AddNewButton
				navIcon="builds"
				href={resolve(`/u/${user.customUrl ?? user.discordId}/builds`)}
			/>
		</div>
	{/if}

	{#each weaponCategories as category (category.name)}
		<div class="category">
			<div class="category-header">
				<img
					src={asset(`/img/weapon-categories/${category.name}.avif`)}
					width={40}
					height={40}
					alt={weaponCategoryTranslations[category.name]()}
				/>
				{weaponCategoryTranslations[category.name]()}
			</div>
			<div class="category-weapons">
				{#each (category.weaponIds as readonly MainWeaponId[]).filter(weaponIdIsNotAlt) as weaponId, i (weaponId)}
					{#if i !== 0 && weaponId % 10 === 0}
						<div class="category-divider"></div>
					{/if}
					<a
						href={weaponBuildPage(weaponId)}
						class="category-weapon"
						data-testid={`weapon-${weaponId}-link`}
					>
						<img
							class="category-weapon-img"
							src={asset(`/img/main-weapons/${weaponId}.avif`)}
							width={28}
							height={28}
							alt=""
						/>
						{weaponTranslations[weaponId]()}
					</a>
				{/each}
			</div>
		</div>
	{/each}
</Main>

<style>
	.category-divider {
		height: 20px;
		margin: auto 0;
		width: 4px;
		border-radius: var(--radius-box);
		background-color: var(--color-primary-transparent);
	}

	.category {
		display: flex;
		flex-direction: column;
		padding: var(--s-3);
		border-radius: var(--radius-box);
		background-color: var(--color-base-section);
		font-size: var(--fonts-sm);
		font-weight: 600;
		gap: var(--s-4);
		border: var(--border-style);
	}

	.category-header {
		display: flex;
		align-items: center;
		gap: var(--s-2-5);
	}

	.category-weapons {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-3);
	}

	.category-weapon {
		display: flex;
		align-items: center;
		color: var(--color-base-content);
		font-size: var(--fonts-xs);
		font-weight: var(--body);
		gap: var(--s-1);

		:global(.category-weapon-img) {
			border-radius: var(--rounded);
			background-color: var(--bg-darker);
		}
	}
</style>
