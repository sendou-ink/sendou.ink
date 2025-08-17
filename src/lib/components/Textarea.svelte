<script lang="ts">
	import type { HTMLTextareaAttributes } from 'svelte/elements';

	let { value = $bindable(), ...rest }: HTMLTextareaAttributes = $props();
</script>

<textarea bind:value {...rest}></textarea>

<style>
	textarea {
		width: var(--field-width-medium);
		max-width: 100%;
		height: 8rem;
		padding: var(--s-2-5) var(--s-3);
		border: var(--border-style);
		border-radius: var(--radius-field);
		accent-color: var(--color-secondary);
		background-color: var(--color-base-card-section);
		color: var(--text);
		outline: none;
		overflow-wrap: normal;
		overflow-x: auto;
		font-weight: var(--body);
	}

	textarea:focus-within {
		outline: 2px solid var(--color-primary);
	}
</style>
