<script lang="ts">
	import type { ButtonProps } from '$lib/components/button.svelte';
	import Button from '$lib/components/button.svelte';
	import { Popover } from 'bits-ui';

	let buttonProps: ButtonProps = $props();
</script>

<!-- xxx: no animation on click? -->
<Popover.Trigger>
	{#snippet child({ props })}
		<Button {...props} {...buttonProps} />
	{/snippet}
</Popover.Trigger>
