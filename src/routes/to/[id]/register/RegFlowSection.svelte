<script lang="ts">
	import type { Snippet } from 'svelte';

	const { children }: { children: Snippet } = $props();
</script>

<section>
	<div class="section-content">{@render children()}</div>
</section>

<style>
	section {
		border: var(--border-style);
		border-radius: var(--radius-box);
		padding: var(--s-6);
		background-color: var(--color-base-section);
		margin-bottom: var(--s-8);

		/** xxx: make take full width on mobile with no border radius */
		@media (max-width: 768px) {
			margin-bottom: var(--s-4);
		}
	}

	.section-content {
		min-height: 200px;
	}
</style>
