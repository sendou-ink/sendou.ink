import { m } from '$lib/paraglide/messages';

export const navItems = [
	{
		id: 'settings',
		name: m['common:pages.settings'],
		url: 'settings',
		prefetch: true
	},
	import.meta.env.VITE_SHOW_LUTI_NAV_ITEM === 'true'
		? {
				id: 'luti',
				name: m['common:pages.luti'],
				url: 'luti',
				prefetch: false
			}
		: null,
	{
		id: 'sendouq',
		name: m['common:pages.sendouq'],
		url: 'q',
		prefetch: false
	},
	{
		id: 'analyzer',
		name: m['common:pages.analyzer'],
		url: 'analyzer',
		prefetch: true
	},
	{
		id: 'builds',
		name: m['common:pages.builds'],
		url: 'builds',
		prefetch: true
	},
	{
		id: 'object-damage-calculator',
		name: m['common:pages.object-damage-calculator'],
		url: 'object-damage-calculator',
		prefetch: true
	},
	{
		id: 'leaderboards',
		name: m['common:pages.leaderboards'],
		url: 'leaderboards',
		prefetch: false
	},
	{
		id: 'scrims',
		name: m['common:pages.scrims'],
		url: 'scrims',
		prefetch: false
	},
	{
		id: 'lfg',
		name: m['common:pages.lfg'],
		url: 'lfg',
		prefetch: false
	},
	{
		id: 'plans',
		name: m['common:pages.plans'],
		url: 'plans',
		prefetch: false
	},
	{
		id: 'badges',
		name: m['common:pages.badges'],
		url: 'badges',
		prefetch: false
	},
	{
		id: 'calendar',
		name: m['common:pages.calendar'],
		url: 'calendar',
		prefetch: false
	},
	{
		id: 'plus',
		name: m['common:pages.plus'],
		url: 'plus/suggestions',
		prefetch: false
	},
	{
		id: 'u',
		name: m['common:pages.u'],
		url: 'u',
		prefetch: false
	},
	{
		id: 'xsearch',
		name: m['common:pages.xsearch'],
		url: 'xsearch',
		prefetch: false
	},
	{
		id: 'articles',
		name: m['common:pages.articles'],
		url: 'a',
		prefetch: false
	},
	{
		id: 'vods',
		name: m['common:pages.vods'],
		url: 'vods',
		prefetch: false
	},
	{
		id: 'art',
		name: m['common:pages.art'],
		url: 'art',
		prefetch: false
	},
	{
		id: 't',
		name: m['common:pages.t'],
		url: 't',
		prefetch: false
	},
	{
		id: 'links',
		name: m['common:pages.links'],
		url: 'links',
		prefetch: true
	},
	{
		id: 'maps',
		name: m['common:pages.maps'],
		url: 'maps',
		prefetch: false
	}
].filter((item) => item !== null);
