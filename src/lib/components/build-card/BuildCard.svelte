<script lang="ts">
	import {
		gearImageUrl,
		modeImageUrl,
		navIconUrl,
		userBuildsPage,
		weaponBuildPage
	} from '$lib/utils/urls';
	import Ability from '$lib/components/Ability.svelte';
	import Image from '$lib/components/image/Image.svelte';
	import type {
		Ability as AbilityType,
		BuildAbilitiesTuple,
		MainWeaponId,
		ModeShort
	} from '$lib/constants/in-game/types';
	import type { GearType, Tables, UserWithPlusTier } from '$lib/server/db/tables';
	import { m } from '$lib/paraglide/messages';
	import { modesLongTranslations, weaponTranslations } from '$lib/utils/i18n';
	import WeaponImage from '$lib/components/image/WeaponImage.svelte';
	import { altWeaponIdToId } from '$lib/constants/in-game/weapon-ids';
	import { getLocale } from '$lib/paraglide/runtime';
	import Lock from '@lucide/svelte/icons/lock';
	import Popover from '$lib/components/popover/Popover.svelte';
	import PopoverTriggerButton from '$lib/components/popover/PopoverTriggerButton.svelte';
	import ActionsMenu from '$lib/components/build-card/ActionsMenu.svelte';

	interface BuildWeaponWithTop500Info {
		weaponSplId: MainWeaponId;
		minRank: number | null;
		maxPower: number | null;
	}

	interface BuildProps {
		build: Pick<
			Tables['Build'],
			| 'id'
			| 'title'
			| 'description'
			| 'clothesGearSplId'
			| 'headGearSplId'
			| 'shoesGearSplId'
			| 'updatedAt'
			| 'private'
		> & {
			abilities: BuildAbilitiesTuple;
			unsortedAbilities: BuildAbilitiesTuple;
			modes: ModeShort[] | null;
			weapons: Array<{
				weaponSplId: Tables['BuildWeapon']['weaponSplId'];
				minRank: number | null;
				maxPower: number | null;
			}>;
		};
		owner?: Pick<UserWithPlusTier, 'discordId' | 'username' | 'plusTier'>;
		withAbilitySorting?: boolean;
		canEdit?: boolean;
	}

	let { build, owner, withAbilitySorting = true, canEdit: _canEdit = false }: BuildProps = $props();

	// xxx: why does the build not show updates (on build privacy change) even when this does log?
	// $inspect(build.private);

	const abilities = $derived(withAbilitySorting ? build.abilities : build.unsortedAbilities);
	const isNoGear = $derived(
		[build.headGearSplId, build.clothesGearSplId, build.shoesGearSplId].some((id) => id === -1)
	);
</script>

<div
	class={[
		'card',
		{
			private: build.private
		}
	]}
	data-testid="build-card"
>
	<div>
		<div class="top-row">
			{#if build.modes && build.modes.length > 0}
				<div class="modes">
					{#each build.modes as mode (mode)}
						<Image
							alt={modesLongTranslations[mode]()}
							title={modesLongTranslations[mode]()}
							path={modeImageUrl(mode)}
							width={18}
							height={18}
							data-testid="build-mode-{mode}"
						/>
					{/each}
				</div>
			{/if}
			<h2 class="title" data-testid="build-title">
				{build.title}
			</h2>
		</div>
		<div class="stack horizontal justify-between items-center">
			<div class="date-author-row">
				{#if owner}
					<a href={userBuildsPage(owner)} class="owner-link">
						{owner.username}
					</a>
					<div>•</div>
				{/if}
				{#if owner?.plusTier}
					<span>+{owner.plusTier}</span>
					<div>•</div>
				{/if}
				<div class="stack horizontal items-center sm">
					{#if build.private}
						<div class="private-text">
							<Lock class="private-icon" />
							{m.common_build_private()}
						</div>
					{/if}
					<time class="whitespace-nowrap">
						{build.updatedAt.toLocaleDateString(getLocale(), {
							day: 'numeric',
							month: 'numeric',
							year: 'numeric'
						})}
					</time>
				</div>
			</div>
			<ActionsMenu buildId={build.id} isPrivate={Boolean(build.private)} showActions={!owner} />
		</div>
	</div>
	<div class="weapons">
		{#each build.weapons as weapon (weapon.weaponSplId)}
			{@render roundWeaponImage(weapon)}
		{/each}
		{#if build.weapons.length === 1}
			<div class="weapon-text">
				{weaponTranslations[build.weapons[0].weaponSplId]()}
			</div>
		{/if}
	</div>
	<div class="gear-abilities {isNoGear ? 'no-gear' : ''}">
		{@render abilitiesRowWithGear('HEAD', abilities[0], build.headGearSplId)}
		{@render abilitiesRowWithGear('CLOTHES', abilities[1], build.clothesGearSplId)}
		{@render abilitiesRowWithGear('SHOES', abilities[2], build.shoesGearSplId)}
	</div>

	{#if build.description}
		<Popover>
			{#snippet trigger()}
				<PopoverTriggerButton class="description-button">
					{build.description}
				</PopoverTriggerButton>
			{/snippet}
			{build.description}
		</Popover>
	{/if}
</div>

{#snippet roundWeaponImage(weapon: BuildWeaponWithTop500Info)}
	{@const normalizedWeaponSplId = altWeaponIdToId.get(weapon.weaponSplId) ?? weapon.weaponSplId}
	{@const isTop500 = typeof weapon.maxPower === 'number' && typeof weapon.minRank === 'number'}

	<div class="weapon">
		{#if isTop500}
			<Image
				class="top-500"
				path={navIconUrl('xsearch')}
				alt=""
				title="Max X Power: {weapon.maxPower} | Best Rank: {weapon.minRank}"
				height={24}
				width={24}
				data-testid="top500-crown"
			/>
		{/if}
		<a href={weaponBuildPage(normalizedWeaponSplId)}>
			<WeaponImage weaponSplId={weapon.weaponSplId} size={36} variant="build" />
		</a>
	</div>
{/snippet}

{#snippet abilitiesRowWithGear(gearType: GearType, abilities: AbilityType[], gearId: number)}
	{#if gearId !== -1}
		<Image
			height={64}
			width={64}
			alt="xxx: TODO"
			title="xxx: TODO"
			path={gearImageUrl(gearType, gearId)}
			class="gear"
		/>
	{/if}
	{#each abilities as ability, i (i)}
		<Ability {ability} size={i === 0 ? 'MAIN' : 'SUB'} />
	{/each}
{/snippet}

<style>
	.card {
		position: relative;
		display: flex;
		flex-direction: column;
		padding: var(--s-3);
		border-radius: var(--radius-box);
		background-color: var(--color-base-card);
		gap: var(--s-3);

		:global(.icon) {
			width: 1.2rem;
			height: 1.2rem;
		}

		:global(.gear) {
			border-radius: 50%;
			background-color: var(--color-base-border);
			overflow: visible;
		}

		:global(.description-button) {
			all: unset;
			background-color: var(--color-base-border);
			text-align: center;
			font-size: var(--fonts-xs);
			border-radius: 0 0 var(--radius-box) var(--radius-box);
			white-space: nowrap;
			text-overflow: ellipsis;
			overflow-x: hidden;
			padding: var(--s-1) var(--s-3);
			margin: auto -12px -12px -12px;
		}
	}

	.private-text {
		display: flex;
		align-items: center;
		font-weight: var(--semi-bold);
		gap: var(--s-1);

		:global(.private-icon) {
			width: 16px;
		}
	}

	.title {
		overflow: hidden;
		height: 2.5rem;
		font-size: var(--fonts-sm);
		line-height: 1.25;
		word-wrap: break-all;
	}

	.top-row {
		display: flex;
		justify-content: space-between;
	}

	.date-author-row {
		display: flex;
		font-size: var(--fonts-xxs);
		gap: var(--s-1);
	}

	.owner-link {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		color: var(--color-primary);
		font-weight: var(--semi-bold);
	}

	.modes {
		position: absolute;
		right: 0;
		display: flex;
		min-width: max-content;
		margin-top: -21px;
		gap: var(--s-1);
	}

	.weapon {
		position: relative;
		padding: var(--s-0-5);
		border-radius: 50%;
		background-color: var(--color-base-border);

		:global(.top-500) {
			position: absolute;
			top: -14px;
			right: 8px;
		}
	}

	.weapon-text {
		padding-left: var(--s-1);
		color: var(--color-base-content-secondary);
		font-size: var(--fonts-xxs);
		font-weight: var(--semi-bold);
	}

	.weapons {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: var(--s-1);
		padding-block-start: var(--s-2);
	}

	.gear-abilities {
		display: grid;
		gap: var(--s-2) var(--s-1);
		grid-template-columns: repeat(5, max-content);
		place-items: center;
	}

	.no-gear {
		grid-template-columns: repeat(4, max-content);
		margin: 0 auto;
		margin-top: 10px;
		margin-bottom: 1rem;
		row-gap: 28px;
	}
</style>
