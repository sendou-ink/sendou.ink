<script lang="ts">
	import { mainWeaponImageUrl, weaponBuildPage, weaponCategoryUrl } from '$lib/utils/urls';
	import OpenGraphMeta from '$lib/components/open-graph-meta.svelte';
	import Image from '$lib/components/image/image.svelte';
	import AddNewButton from '$lib/components/add-new-button.svelte';
	import { resolve } from '$app/paths';
	import { me } from '../me.remote';
	import { weaponCategories, weaponIdIsNotAlt } from '$lib/constants/in-game/weapon-ids';
	import Main from '$lib/components/main.svelte';
	import { weaponCategoryTranslations, weaponTranslations } from '$lib/utils/i18n';
	import type { MainWeaponId } from '$lib/constants/in-game/types';

	const user = $derived(await me());
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
				<Image
					path={weaponCategoryUrl(category.name)}
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
						<Image
							class="category-weapon-img"
							path={mainWeaponImageUrl(weaponId)}
							width={28}
							height={28}
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
