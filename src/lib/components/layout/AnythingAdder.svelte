<script>
	import { resolve, asset } from '$app/paths';
	import { m } from '$lib/paraglide/messages';
	import Menu from '../menu/Menu.svelte';
	import MenuTriggerButton from '../menu/MenuTriggerButton.svelte';
	import Plus from '@lucide/svelte/icons/plus';
</script>

<div>
	<Menu
		items={[
			{
				label: m.common_header_adder_tournament(),
				imgSrc: asset('/img/layout/medal.avif'),
				href: resolve('/to/new')
			},
			{
				label: m.common_header_adder_calendarEvent(),
				imgSrc: asset('/img/layout/calendar.avif'),
				href: resolve('/calendar/new')
			},
			{
				label: m.common_header_adder_build(),
				imgSrc: asset('/img/layout/builds.avif'),
				href: resolve('/builds/new')
			},
			{
				label: m.common_header_adder_team(),
				imgSrc: asset('/img/layout/t.avif'),
				href: resolve('/t/new')
			},
			{
				label: m.common_header_adder_scrimPost(),
				imgSrc: asset('/img/layout/scrims.avif'),
				href: resolve('/scrims/new')
			},
			{
				label: m.common_header_adder_association(),
				imgSrc: asset('/img/layout/associations.avif'),
				href: resolve('/associations/new')
			},
			{
				label: m.common_header_adder_lfgPost(),
				imgSrc: asset('/img/layout/lfg.avif'),
				href: resolve('/lfg/new')
			},
			{
				label: m.common_header_adder_art(),
				imgSrc: asset('/img/layout/art.avif'),
				href: resolve('/art/new')
			},
			{
				label: m.common_header_adder_vod(),
				imgSrc: asset('/img/layout/vods.avif'),
				href: resolve('/vods/new')
			},
			{
				label: m.common_header_adder_plusSuggestion(),
				imgSrc: asset('/img/layout/plus.avif'),
				href: resolve('/plus/new')
			}
		]}
	>
		<MenuTriggerButton icon={Plus} variant="popover" />
	</Menu>
</div>
