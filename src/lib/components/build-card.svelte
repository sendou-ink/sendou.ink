<script lang="ts">
	import {
		gearImageUrl,
		modeImageUrl,
		navIconUrl,
		userBuildsPage,
		weaponBuildPage
	} from '$lib/utils/urls';
	import Ability from './ability.svelte';
	import Image from './image/image.svelte';
	import LockIcon from './icons/lock.svelte';
	import type {
		Ability as AbilityType,
		BuildAbilitiesTuple,
		MainWeaponId,
		ModeShort
	} from '$lib/constants/in-game/types';
	import type { GearType, Tables, UserWithPlusTier } from '$lib/server/db/tables';
	import { m } from '$lib/paraglide/messages';
	import { modesLongTranslations, weaponTranslations } from '$lib/utils/i18n';
	import WeaponImage from '$lib/components/image/weapon-image.svelte';
	import { altWeaponIdToId } from '$lib/constants/in-game/weapon-ids';
	import { getLocale } from '$lib/paraglide/runtime';
	import Popover from '$lib/components/popover.svelte';
	import Button from '$lib/components/button.svelte';
	import EditIcon from '$lib/components/icons/edit.svelte';
	import SpeechBubbleIcon from '$lib/components/icons/speech-bubble.svelte';
	import TrashIcon from '$lib/components/icons/trash.svelte';
	import { deleteBuild } from '../../routes/u/[identifier]/builds/delete-build.remote';

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
			<div class="stack horizontal sm">
				{#if build.private}
					<div class="private-text">
						<LockIcon class="private-icon" />
						{m.common_build_private()}
					</div>
				{/if}
				<time class="whitespace-nowrap">
					{build.updatedAt.toLocaleDateString(getLocale(), {
						day: 'numeric',
						month: 'long',
						year: 'numeric'
					})}
				</time>
			</div>
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
	<div class="bottom-row">
		<a href="xxx:">
			<Image alt={m.common_pages_analyzer()} class="icon" path={navIconUrl('analyzer')} />
		</a>
		{#if build.description}
			<Popover>
				{#snippet anchorButton(popovertarget)}
					<Button variant="minimal" class="small-text" {popovertarget}>
						{#snippet icon()}
							<SpeechBubbleIcon />
						{/snippet}
					</Button>
				{/snippet}
				{build.description}
			</Popover>
		{/if}
		{#if true}
			<Button
				class="small-text"
				variant="minimal"
				size="small"
				href="xxx:"
				data-testid="edit-build"
			>
				{#snippet icon()}
					<EditIcon class="icon" />
				{/snippet}
			</Button>
		{/if}
		<Popover>
			{#snippet anchorButton(popovertarget)}
				<Button {popovertarget} variant="minimal-destructive">
					{#snippet icon()}
						<TrashIcon class="icon" />
					{/snippet}
				</Button>
			{/snippet}
			Delete build? <Button
				onclick={async () => {
					console.log('Deleting build', build.id);

					// xxx: optimistic
					await deleteBuild({
						buildId: build.id,
						identifier: 'sendou' // xxx: pass identifier
					});
				}}>Delete</Button
			>
		</Popover>
		<!-- <FormWithConfirm
				dialogHeading={$_('builds.deleteConfirm', { values: { title } })}
				fields={[
					['buildToDeleteId', id],
					['_action', 'DELETE_BUILD']
				]}
			>
				<SendouButton
					icon={TrashIcon}
					class="small-text icon"
					variant="minimal-destructive"
					type="submit"
				/>
			</FormWithConfirm> -->
	</div>
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
		border-radius: var(--rounded);
		background-color: var(--bg-lighter);
		gap: var(--s-3);

		:global(.icon) {
			width: 1.2rem;
			height: 1.2rem;
		}

		:global(.gear) {
			border-radius: 50%;
			background-color: var(--bg-darker-very-transparent);
			overflow: visible;
		}
	}

	.private {
		background-color: var(--bg-lighter-transparent);
	}

	.private-text {
		display: flex;
		justify-content: center;
		font-weight: var(--semi-bold);
		gap: var(--s-1);

		:global(.private-icon) {
			width: 16px;
			margin-block-end: var(--s-1);
			stroke-width: 2px;
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
		background-color: var(--bg-darker-very-transparent);

		:global(.top-500) {
			position: absolute;
			top: -14px;
			right: 8px;
		}
	}

	.weapon-text {
		padding-left: var(--s-1);
		color: var(--text-lighter);
		font-size: var(--fonts-xxs);
		font-weight: var(--semi-bold);
	}

	.weapons {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: var(--s-1);
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

	.bottom-row {
		display: flex;
		height: 100%;
		align-items: flex-end;
		justify-content: center;
		gap: var(--s-4);
	}

	/*


	.small-text {
		font-size: var(--fonts-xxs) !important;
	} */
</style>
