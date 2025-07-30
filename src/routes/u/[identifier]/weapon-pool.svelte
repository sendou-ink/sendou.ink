<script lang="ts">
	import WeaponImage from '$lib/components/image/weapon-image.svelte';
	import type { UserProfileData } from './user-profile.remote';

	interface Props {
		weapons: UserProfileData['weapons'];
	}

	let { weapons }: Props = $props();
</script>

<div class="stack horizontal sm justify-center">
	{#each weapons as weapon, i (weapon.weaponSplId)}
		<div class="weapon">
			<WeaponImage
				data-testid={`${weapon.weaponSplId}-${i + 1}`}
				weaponSplId={weapon.weaponSplId}
				variant={weapon.isFavorite ? 'badge-5-star' : 'badge'}
				size={38}
			/>
		</div>
	{/each}
</div>

<style>
	.weapon {
		padding: var(--s-2);
		border-radius: 100%;
		background-color: var(--bg-lighter);
	}
</style>
