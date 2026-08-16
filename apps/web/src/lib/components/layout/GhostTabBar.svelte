<script lang="ts">
	interface Props {
		tabCount: number;
		onTabPress: (index: number) => void;
	}

	let { tabCount, onTabPress }: Props = $props();
</script>

<div class="ghostTabBar" aria-hidden="true">
	{#each { length: tabCount } as _, i (i)}
		<!-- svelte-ignore a11y_consider_explicit_label -- invisible hit targets inside an aria-hidden bar -->
		<button
			type="button"
			data-testid="ghost-tab"
			class="ghostTab"
			tabindex={-1}
			onclick={() => onTabPress(i)}
		></button>
	{/each}
</div>

<style>
	.ghostTabBar {
		position: fixed;
		bottom: calc(0px - var(--layout-nav-height));
		left: 0;
		right: 0;
		height: calc(var(--layout-nav-height) + env(safe-area-inset-bottom));
		padding-bottom: env(safe-area-inset-bottom);
		display: flex;
		justify-content: space-around;
		align-items: center;
		z-index: 100;
	}

	.ghostTab {
		height: 100%;
		flex: 1;
		background: none;
		border: none;
		cursor: pointer;
		opacity: 0;
		padding: 0;
	}
</style>
