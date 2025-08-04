<script lang="ts">
	import type { ButtonProps } from '$lib/components/button.svelte';
	import Button from '$lib/components/button.svelte';
	import { DropdownMenu } from 'bits-ui';

	let buttonProps: ButtonProps = $props();
</script>

<!-- xxx: no animation on click? -->
<DropdownMenu.Trigger>
	{#snippet child({ props })}
		<Button {...props} {...buttonProps} />
	{/snippet}
</DropdownMenu.Trigger>
