import { m } from '$lib/paraglide/messages';

export const navItems = [
	{
		id: 'settings',
		name: m.common_pages_settings(),
		url: 'settings',
		prefetch: true
	},
	import.meta.env.VITE_SHOW_LUTI_NAV_ITEM === 'true'
		? {
				id: 'luti',
				name: m.common_pages_luti(),
				url: 'luti',
				prefetch: false
			}
		: null,
	{
		id: 'q',
		name: m.common_pages_sendouq(),
		url: 'q',
		prefetch: false
	},
	{
		id: 'analyzer',
		name: m.common_pages_analyzer(),
		url: 'analyzer',
		prefetch: true
	},
	{
		id: 'builds',
		name: m.common_pages_builds(),
		url: 'builds',
		prefetch: true
	},
	{
		id: 'object-damage-calculator',
		name: m.common_pages_object_damage_calculator(),
		url: 'object-damage-calculator',
		prefetch: true
	},
	{
		id: 'leaderboards',
		name: m.common_pages_leaderboards(),
		url: 'leaderboards',
		prefetch: false
	},
	{
		id: 'scrims',
		name: m.common_pages_scrims(),
		url: 'scrims',
		prefetch: false
	},
	{
		id: 'lfg',
		name: m.common_pages_lfg(),
		url: 'lfg',
		prefetch: false
	},
	{
		id: 'plans',
		name: m.common_pages_plans(),
		url: 'plans',
		prefetch: false
	},
	{
		id: 'badges',
		name: m.common_pages_badges(),
		url: 'badges',
		prefetch: false
	},
	{
		id: 'calendar',
		name: m.common_pages_calendar(),
		url: 'calendar',
		prefetch: false
	},
	{
		id: 'plus',
		name: m.common_pages_plus(),
		url: 'plus/suggestions',
		prefetch: false
	},
	{
		id: 'u',
		name: m.common_pages_u(),
		url: 'u',
		prefetch: false
	},
	{
		id: 'xsearch',
		name: m.common_pages_xsearch(),
		url: 'xsearch',
		prefetch: false
	},
	{
		id: 'articles',
		name: m.common_pages_articles(),
		url: 'a',
		prefetch: false
	},
	{
		id: 'vods',
		name: m.common_pages_vods(),
		url: 'vods',
		prefetch: false
	},
	{
		id: 'art',
		name: m.common_pages_art(),
		url: 'art',
		prefetch: false
	},
	{
		id: 't',
		name: m.common_pages_t(),
		url: 't',
		prefetch: false
	},
	{
		id: 'links',
		name: m.common_pages_links(),
		url: 'links',
		prefetch: true
	},
	{
		id: 'maps',
		name: m.common_pages_maps(),
		url: 'maps',
		prefetch: false
	}
].filter((item) => item !== null);
