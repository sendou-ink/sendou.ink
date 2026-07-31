import { resetFaker } from "./faker";

/** Arguments `defaults` does not supply, which the caller therefore has to pass. */
type RequiredArgs<Args, Defaults> = Omit<Args, keyof Defaults>;

type CreateArgs<Args, Defaults> = RequiredArgs<Args, Defaults> & Partial<Args>;

/** `null` says "all defaults", for when only `options` is of interest. */
type CreateParams<Args, Defaults, Options> = [
	keyof RequiredArgs<Args, Defaults>,
] extends [never]
	? [overrides?: Partial<Args> | null, options?: Options]
	: [overrides: CreateArgs<Args, Defaults>, options?: Options];

type CreateManyParams<Args, Defaults, Options> = [
	keyof RequiredArgs<Args, Defaults>,
] extends [never]
	? [
			count: number,
			overrides?: ManyOverrides<Args, Defaults> | null,
			options?: Options,
		]
	: [
			count: number,
			overrides: ManyOverrides<Args, Defaults>,
			options?: Options,
		];

type ManyOverrides<Args, Defaults> =
	| CreateArgs<Args, Defaults>
	| ((index: number) => CreateArgs<Args, Defaults>);

export type Factory<Args, Row, Defaults, Options> = {
	/** Inserts one row. Anything not given is defaulted. */
	create: (...args: CreateParams<Args, Defaults, Options>) => Promise<Row>;
	/** Inserts `count` rows. Overrides may be per-index. */
	createMany: (
		...args: CreateManyParams<Args, Defaults, Options>
	) => Promise<Row[]>;
};

const sequenceResets = new Set<() => void>();

/**
 * Defines a factory: a thin wrapper around a repository write function that fills
 * arguments with a plausible default and lets the caller override any of them.
 *
 * `Args` is inferred from `insert`, so factories never restate column types. What
 * `defaults` leaves out — foreign keys above all, which a factory must not invent —
 * becomes a required argument of `create`.
 *
 * Defaults are drawn eagerly, before overrides are applied, so that which fields a
 * caller happens to override does not shift the values every later row gets.
 *
 * `applyOptions` runs after the insert and is how a factory hands back a row in a
 * later state (a concluded match, a finalized tournament). It gets there by running
 * the app's own operations, never by writing the resulting rows itself.
 */
export function defineFactory<
	Args,
	Row,
	Defaults extends Partial<Args> = Record<never, never>,
	Options = never,
>({
	defaults,
	insert,
	applyOptions,
}: {
	/** Omitted by a factory whose every argument is a foreign key it must not invent. */
	defaults?: (ctx: { seq: number }) => Defaults;
	insert: (args: Args) => Promise<Row>;
	applyOptions?: (row: Row, options: Options) => Promise<void>;
}): Factory<Args, Row, Defaults, Options> {
	let seq = 0;
	sequenceResets.add(() => {
		seq = 0;
	});

	const insertOne = async (args: Args, options?: Options) => {
		const row = await insert(args);

		if (applyOptions && options) {
			await applyOptions(row, options);
		}

		return row;
	};

	// `create` requires everything `defaults` doesn't supply, so the merge is a
	// complete `Args` — something the compiler can't work out from the spread
	const build = (overrides: Partial<Args>) =>
		({
			...defaults?.({ seq: ++seq }),
			...overrides,
		}) as Args;

	return {
		create: (...args) => insertOne(build(args[0] ?? {}), args[1]),
		createMany: async (...args) => {
			const [count, overrides, options] = args;
			const rows: Row[] = [];

			for (let index = 0; index < count; index++) {
				rows.push(
					await insertOne(build(overridesAt(overrides, index)), options),
				);
			}

			return rows;
		},
	};
}

/**
 * Reseeds faker and zeroes every factory's sequence, so that a run of the dev seed
 * or a test starting from an empty database produces the same values as the last.
 */
export function resetFactories() {
	resetFaker();

	for (const reset of sequenceResets) {
		reset();
	}
}

function overridesAt<Args, Defaults>(
	overrides: ManyOverrides<Args, Defaults> | null | undefined,
	index: number,
): Partial<Args> {
	if (!overrides) return {};

	return typeof overrides === "function" ? overrides(index) : overrides;
}
