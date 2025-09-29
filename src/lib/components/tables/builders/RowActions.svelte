<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import Menu from '$lib/components/menu/Menu.svelte';
	import MenuTriggerButton from '$lib/components/menu/MenuTriggerButton.svelte';

	type Props = Omit<ComponentProps<typeof Menu>, 'children'>;

	let { ...menuProps }: Props = $props();
</script>

<div>
	<Menu {...menuProps}>
		<MenuTriggerButton icon={Ellipsis} variant="popover" size="small" />
	</Menu>
</div>

<style>
	div {
		display: inline-flex;
		vertical-align: middle;
	}
</style>
