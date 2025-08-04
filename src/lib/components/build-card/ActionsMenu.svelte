<script>
	import Button from '../button.svelte';
	import Menu from '../menu/Menu.svelte';
	import EllipsisVertical from '@lucide/svelte/icons/ellipsis-vertical';
</script>

<!-- xxx: add build actions menu -->
<div>
	<Menu items={[]}>
		<Button icon={EllipsisVertical} size="big" variant="minimal"></Button>
	</Menu>
</div>
