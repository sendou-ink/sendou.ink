import type { CalendarEventTag } from '$lib/server/db/tables';

export const tags = {
	SPECIAL: {
		color: '#CE93D8',
		userSelectable: true
	},
	ART: {
		color: '#C158F6',
		userSelectable: true
	},
	MONEY: {
		color: '#96F29D',
		userSelectable: true
	},
	REGION: {
		color: '#FF8C8C',
		userSelectable: true
	},
	LOW: {
		color: '#BBDEFB',
		userSelectable: true
	},
	HIGH: {
		color: '#FFA000',
		userSelectable: true
	},
	COUNT: {
		color: '#62E8F5',
		userSelectable: true
	},
	LAN: {
		color: '#FFF',
		userSelectable: true
	},
	QUALIFIER: {
		color: '#FFC0CB',
		userSelectable: true
	},
	SZ: {
		color: '#F44336',
		userSelectable: false
	},
	TW: {
		color: '#D50000',
		userSelectable: false
	},
	// xxx: should also these be userSelectable: false?
	ONES: {
		color: '#FAEC25',
		userSelectable: true
	},
	DUOS: {
		color: '#1ADB1E',
		userSelectable: true
	},
	TRIOS: {
		color: '#B694FF',
		userSelectable: true
	},
	S1: {
		color: '#E5E4E2',
		userSelectable: true
	},
	S2: {
		color: '#388E3C',
		userSelectable: true
	},
	SR: {
		color: '#FBCEB1',
		userSelectable: true
	},
	CARDS: {
		color: '#E4D00A',
		userSelectable: true
	},
	COLLEGIATE: {
		color: '#FFC107',
		userSelectable: true
	}
};

export const userSelectableTags = Object.entries(tags)
	.filter(([, value]) => value.userSelectable)
	.map(([key]) => key as CalendarEventTag) as Array<Exclude<CalendarEventTag, 'SZ' | 'TW'>>;

export const TOURNAMENT_MAP_PICKING_STYLES = [
	'TO',
	'AUTO_ALL',
	'AUTO_SZ',
	'AUTO_TC',
	'AUTO_RM',
	'AUTO_CB'
] as const;
