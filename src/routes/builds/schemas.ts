import { z } from 'zod/v4';
import { ability, modeShort, safeJSONParse } from '$lib/utils/zod';
import { weaponSplId } from '$lib/schemas';
import type { MainWeaponId } from '$lib/constants/in-game/types';
import { assertType } from '$lib/utils/types';

export const MAX_BUILD_FILTERS = 6;

const abilityFilterSchema = z.object({
	type: z.literal('ability'),
	ability: z.string().toUpperCase().pipe(ability),
	value: z.union([z.number(), z.boolean()]),
	comparison: z
		.string()
		.toUpperCase()
		.pipe(z.enum(['AT_LEAST', 'AT_MOST']))
		.optional()
});

const modeFilterSchema = z.object({
	type: z.literal('mode'),
	mode: z.string().toUpperCase().pipe(modeShort)
});

const dateFilterSchema = z.object({
	type: z.literal('date'),
	date: z.string()
});

export const buildFiltersSearchParams = z.preprocess(
	safeJSONParse,
	z.union([
		z.null(),
		z
			.array(z.union([abilityFilterSchema, modeFilterSchema, dateFilterSchema]))
			.max(MAX_BUILD_FILTERS)
	])
);

export type BuildFiltersFromSearchParams = NonNullable<z.infer<typeof buildFiltersSearchParams>>;

const slugToMainWeaponId = {
	'sploosh-o-matic': 0,
	'neo-sploosh-o-matic': 1,
	'splattershot-jr': 10,
	'custom-splattershot-jr': 11,
	'splash-o-matic': 20,
	'neo-splash-o-matic': 21,
	'splash-o-matic-gck-o': 22,
	'aerospray-mg': 30,
	'aerospray-rg': 31,
	'colorz-aerospray': 32,
	splattershot: 40,
	'tentatek-splattershot': 41,
	'glamorz-splattershot': 42,
	'hero-shot-replica': 45,
	'octo-shot-replica': 46,
	'order-shot-replica': 47,
	'52-gal': 50,
	'52-gal-deco': 51,
	'n-zap-85': 60,
	'n-zap-89': 61,
	'splattershot-pro': 70,
	'forge-splattershot-pro': 71,
	'splattershot-pro-frz-n': 72,
	'96-gal': 80,
	'96-gal-deco': 81,
	'clawz-96-gal': 82,
	'jet-squelcher': 90,
	'custom-jet-squelcher': 91,
	'jet-squelcher-cob-r': 92,
	'splattershot-nova': 100,
	'annaki-splattershot-nova': 101,
	'luna-blaster': 200,
	'luna-blaster-neo': 201,
	'order-blaster-replica': 205,
	blaster: 210,
	'custom-blaster': 211,
	'gleamz-blaster': 212,
	'range-blaster': 220,
	'custom-range-blaster': 221,
	'clash-blaster': 230,
	'clash-blaster-neo': 231,
	'rapid-blaster': 240,
	'rapid-blaster-deco': 241,
	'rapid-blaster-pro': 250,
	'rapid-blaster-pro-deco': 251,
	'rapid-blaster-pro-wnt-r': 252,
	's-blast-92': 260,
	's-blast-91': 261,
	'l-3-nozzlenose': 300,
	'l-3-nozzlenose-d': 301,
	'glitterz-l-3-nozzlenose': 302,
	'h-3-nozzlenose': 310,
	'h-3-nozzlenose-d': 311,
	'h-3-nozzlenose-vip-r': 312,
	squeezer: 400,
	'foil-squeezer': 401,
	'carbon-roller': 1000,
	'carbon-roller-deco': 1001,
	'carbon-roller-ang-l': 1002,
	'splat-roller': 1010,
	'krak-on-splat-roller': 1011,
	'order-roller-replica': 1015,
	'dynamo-roller': 1020,
	'gold-dynamo-roller': 1021,
	'starz-dynamo-roller': 1022,
	'flingza-roller': 1030,
	'foil-flingza-roller': 1031,
	'big-swig-roller': 1040,
	'big-swig-roller-express': 1041,
	'planetz-big-swig-roller': 1042,
	inkbrush: 1100,
	'inkbrush-nouveau': 1101,
	octobrush: 1110,
	'octobrush-nouveau': 1111,
	'cometz-octobrush': 1112,
	'orderbrush-replica': 1115,
	painbrush: 1120,
	'painbrush-nouveau': 1121,
	'painbrush-brn-z': 1122,
	'classic-squiffer': 2000,
	'new-squiffer': 2001,
	'splat-charger': 2010,
	'zf-splat-charger': 2011,
	'splat-charger-cam-o': 2012,
	'order-charger-replica': 2015,
	splatterscope: 2020,
	'zf-splatterscope': 2021,
	'splatterscope-cam-o': 2022,
	'e-liter-4k': 2030,
	'custom-e-liter-4k': 2031,
	'e-liter-4k-scope': 2040,
	'custom-e-liter-4k-scope': 2041,
	'bamboozler-14-mk-i': 2050,
	'bamboozler-14-mk-ii': 2051,
	'goo-tuber': 2060,
	'custom-goo-tuber': 2061,
	'snipewriter-5h': 2070,
	'snipewriter-5b': 2071,
	slosher: 3000,
	'slosher-deco': 3001,
	'order-slosher-replica': 3005,
	'tri-slosher': 3010,
	'tri-slosher-nouveau': 3011,
	'tri-slosher-ash-n': 3012,
	'sloshing-machine': 3020,
	'sloshing-machine-neo': 3021,
	bloblobber: 3030,
	'bloblobber-deco': 3031,
	explosher: 3040,
	'custom-explosher': 3041,
	'dread-wringer': 3050,
	'dread-wringer-d': 3051,
	'hornz-dread-wringer': 3052,
	'mini-splatling': 4000,
	'zink-mini-splatling': 4001,
	'mini-splatling-rtl-r': 4002,
	'heavy-splatling': 4010,
	'heavy-splatling-deco': 4011,
	'order-splatling-replica': 4015,
	'hydra-splatling': 4020,
	'custom-hydra-splatling': 4021,
	'torrentz-hydra-splatling': 4022,
	'ballpoint-splatling': 4030,
	'ballpoint-splatling-nouveau': 4031,
	'nautilus-47': 4040,
	'nautilus-79': 4041,
	'heavy-edit-splatling': 4050,
	'heavy-edit-splatling-nouveau': 4051,
	'dapple-dualies': 5000,
	'dapple-dualies-nouveau': 5001,
	'dapple-dualies-noc-t': 5002,
	'splat-dualies': 5010,
	'enperry-splat-dualies': 5011,
	'twinklez-splat-dualies': 5012,
	'order-dualie-replicas': 5015,
	'glooga-dualies': 5020,
	'glooga-dualies-deco': 5021,
	'dualie-squelchers': 5030,
	'custom-dualie-squelchers': 5031,
	'hoofz-dualie-squelchers': 5032,
	'dark-tetra-dualies': 5040,
	'light-tetra-dualies': 5041,
	'douser-dualies-ff': 5050,
	'custom-douser-dualies-ff': 5051,
	'splat-brella': 6000,
	'sorella-brella': 6001,
	'order-brella-replica': 6005,
	'tenta-brella': 6010,
	'tenta-sorella-brella': 6011,
	'tenta-brella-cre-m': 6012,
	'undercover-brella': 6020,
	'undercover-sorella-brella': 6021,
	'patternz-undercover-brella': 6022,
	'recycled-brella-24-mk-i': 6030,
	'recycled-brella-24-mk-ii': 6031,
	'tri-stringer': 7010,
	'inkline-tri-stringer': 7011,
	'bulbz-tri-stringer': 7012,
	'order-stringer-replica': 7015,
	'reef-lux-450': 7020,
	'reef-lux-450-deco': 7021,
	'reef-lux-450-mil-k': 7022,
	'wellstring-v': 7030,
	'custom-wellstring-v': 7031,
	'splatana-stamper': 8000,
	'splatana-stamper-nouveau': 8001,
	'stickerz-splatana-stamper': 8002,
	'order-splatana-replica': 8005,
	'splatana-wiper': 8010,
	'splatana-wiper-deco': 8011,
	'splatana-wiper-rus-t': 8012,
	'mint-decavitator': 8020,
	'charcoal-decavitator': 8021
} as const;

export const allWeaponSlugs = Object.keys(
	slugToMainWeaponId
) as (keyof typeof slugToMainWeaponId)[];

assertType<(typeof slugToMainWeaponId)[keyof typeof slugToMainWeaponId], MainWeaponId>();

export const weaponIdFromSlug = z.preprocess((val) => {
	if (typeof val === 'string') {
		return slugToMainWeaponId[val as keyof typeof slugToMainWeaponId];
	}

	return val;
}, weaponSplId);
