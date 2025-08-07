<script lang="ts">
	import type { ButtonProps } from '$lib/components/Button.svelte';
	import Button from '$lib/components/Button.svelte';
	import { Dialog } from 'bits-ui';

	let buttonProps: ButtonProps = $props();
</script>

<Dialog.Trigger>
	{#snippet child({ props })}
		<Button {...props} {...buttonProps} />
	{/snippet}
</Dialog.Trigger>
