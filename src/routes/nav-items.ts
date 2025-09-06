import { resolve } from '$app/paths';
import { m } from '$lib/paraglide/messages';

const navItemsBase = [
	{
		id: 'settings',
		name: m.common_pages_settings(),
		url: resolve('/settings'),
		prefetch: true
	},
	{
		id: 'q',
		name: m.common_pages_sendouq(),
		url: resolve('/q'),
		prefetch: false
	},
	{
		id: 'analyzer',
		name: m.common_pages_analyzer(),
		url: resolve('/analyzer'),
		prefetch: true
	},
	{
		id: 'builds',
		name: m.common_pages_builds(),
		url: resolve('/builds'),
		prefetch: true
	},
	{
		id: 'object-damage-calculator',
		name: m.common_pages_object_damage_calculator(),
		url: resolve('/object-damage-calculator'),
		prefetch: true
	},
	{
		id: 'leaderboards',
		name: m.common_pages_leaderboards(),
		url: resolve('/leaderboards'),
		prefetch: false
	},
	{
		id: 'scrims',
		name: m.common_pages_scrims(),
		url: resolve('/scrims'),
		prefetch: false
	},
	{
		id: 'lfg',
		name: m.common_pages_lfg(),
		url: resolve('/lfg'),
		prefetch: false
	},
	{
		id: 'plans',
		name: m.common_pages_plans(),
		url: resolve('/plans'),
		prefetch: false
	},
	{
		id: 'badges',
		name: m.common_pages_badges(),
		url: resolve('/badges'),
		prefetch: false
	},
	{
		id: 'calendar',
		name: m.common_pages_calendar(),
		url: resolve('/calendar'),
		prefetch: false
	},
	{
		id: 'plus',
		name: m.common_pages_plus(),
		url: resolve('/plus/suggestions'),
		prefetch: false
	},
	{
		id: 'xsearch',
		name: m.common_pages_xsearch(),
		url: resolve('/xsearch'),
		prefetch: false
	},
	{
		id: 'articles',
		name: m.common_pages_articles(),
		url: resolve('/a'),
		prefetch: false
	},
	{
		id: 'vods',
		name: m.common_pages_vods(),
		url: resolve('/vods'),
		prefetch: false
	},
	{
		id: 'art',
		name: m.common_pages_art(),
		url: resolve('/art'),
		prefetch: false
	},
	{
		id: 'links',
		name: m.common_pages_links(),
		url: resolve('/links'),
		prefetch: true
	},
	{
		id: 'maps',
		name: m.common_pages_maps(),
		url: resolve('/maps'),
		prefetch: false
	}
] as const;

const navItemsWithLuti = [
	{
		id: 'luti',
		name: m.common_pages_luti(),
		url: 'luti',
		prefetch: false
	},
	...navItemsBase
] as const;

export const navItems =
	import.meta.env.VITE_SHOW_LUTI_NAV_ITEM === 'true' ? navItemsWithLuti : navItemsBase;

/** Nav icon ids corresponding to drawn images representing different sendou.ink features */
export type NavIconId = (typeof navItems)[number]['id'] | 't';
