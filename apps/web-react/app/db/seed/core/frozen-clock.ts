const RealDate = Date;

/**
 * Parses the `SEED_NOW` env var (epoch milliseconds or an ISO 8601 date) into
 * epoch milliseconds, or returns null when it is not set.
 */
function parseSeedNow(): number | null {
	const raw = process.env.SEED_NOW;
	if (!raw) return null;

	const parsed = /^\d+$/.test(raw) ? Number(raw) : RealDate.parse(raw);
	if (Number.isNaN(parsed)) {
		throw new Error(
			`SEED_NOW must be epoch milliseconds or an ISO 8601 date, got "${raw}"`,
		);
	}

	return parsed;
}

/**
 * Freezes the process-global clock at `SEED_NOW` so that everything the seed
 * touches — factories, `databaseTimestampNow`, date-fns arithmetic — observes
 * the same instant, making seeded timestamps a pure function of `SEED_NOW`.
 * No-op when `SEED_NOW` is not set. Timers are left real; only `Date`'s idea
 * of "now" is pinned.
 *
 * Meant for dedicated seed processes (`scripts/seed.ts`, the differ's seeding
 * step), never for a serving app process.
 */
export function installSeedClock() {
	const seedNow = parseSeedNow();
	if (seedNow === null) return;
	const fixedNow: number = seedNow;

	type DateArgs =
		| []
		| [value: number | string | Date]
		| [
				year: number,
				monthIndex: number,
				day?: number,
				hours?: number,
				minutes?: number,
				seconds?: number,
				ms?: number,
		  ];

	class FrozenDate extends RealDate {
		constructor(...args: DateArgs) {
			if (args.length === 0) {
				super(fixedNow);
			} else if (args.length === 1) {
				super(args[0]);
			} else {
				super(...(args as [number, number]));
			}
		}

		static now() {
			return fixedNow;
		}
	}

	globalThis.Date = FrozenDate as DateConstructor;
}
