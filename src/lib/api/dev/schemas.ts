import z from 'zod';

export const SEED_VARIATIONS = [
	'NO_TOURNAMENT_TEAMS',
	'DEFAULT',
	'REG_OPEN',
	'SMALL_SOS',
	'NZAP_IN_TEAM'
] as const;

export const seedSchema = z.enum(SEED_VARIATIONS).default('DEFAULT');

export type SeedVariation = NonNullable<z.infer<typeof seedSchema>>;
