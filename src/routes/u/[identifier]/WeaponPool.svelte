<script lang="ts">
	import type { ProfileByIdentifierData } from '$lib/api/user/queries.remote';
	import WeaponImage from '$lib/components/image/WeaponImage.svelte';

	interface Props {
		weapons: ProfileByIdentifierData['weapons'];
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
		background-color: var(--color-base-section);
		border: var(--border-style);
	}
</style>
