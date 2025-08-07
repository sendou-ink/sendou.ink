<script lang="ts">
	import Menu from '../menu/Menu.svelte';
	import EllipsisVertical from '@lucide/svelte/icons/ellipsis-vertical';
	import Lock from '@lucide/svelte/icons/lock';
	import LockOpen from '@lucide/svelte/icons/lock-open';
	import SquarePen from '@lucide/svelte/icons/square-pen';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import {
		deleteBuild,
		updateBuildVisibility
	} from '../../../routes/u/[identifier]/builds/build-actions.remote';
	import MenuTriggerButton from '../menu/MenuTriggerButton.svelte';
	import { navIconUrl } from '$lib/utils/urls';
	import { m } from '$lib/paraglide/messages';
	import { resolve } from '$app/paths';
	import { confirmAction } from '$lib/utils/form';

	interface Props {
		buildId: number;
		buildTitle: string;
		isPrivate: boolean;
		showActions?: boolean;
	}

	let { buildId, buildTitle, isPrivate, showActions }: Props = $props();
</script>

<!-- xxx: add build actions menu -->
<div>
	<Menu
		items={[
			{
				label: m.builds_actions_analyze(),
				imgSrc: navIconUrl('analyzer') + '.avif',
				href: resolve('/') // xxx: analyzer URL
			},
			{
				label: m.common_actions_edit(),
				icon: SquarePen,
				hidden: !showActions,
				href: resolve('/') // xxx: edit URL
			},
			{
				label: m.builds_actions_makePrivate(),
				icon: Lock,
				onclick: async () => await updateBuildVisibility({ buildId, isPrivate: true }),
				hidden: isPrivate || !showActions
			},
			{
				label: m.builds_actions_makePublic(),
				icon: LockOpen,
				onclick: async () => await updateBuildVisibility({ buildId, isPrivate: false }),
				hidden: !isPrivate || !showActions
			},
			{
				label: m.common_actions_delete(),
				icon: Trash2,
				onclick: () =>
					confirmAction(() => deleteBuild(buildId), {
						title: m.builds_deleteConfirm({ title: buildTitle })
					}),
				hidden: !showActions,
				destructive: true
			}
		]}
	>
		<MenuTriggerButton icon={EllipsisVertical} size="big" variant="minimal" />
	</Menu>
</div>
