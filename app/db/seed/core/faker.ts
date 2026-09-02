import { base, en, Faker } from "@faker-js/faker";

const FAKER_SEED = 5800;
const MAX_UNIQUE_ATTEMPTS = 100;

/** Not the global singleton, so app code or a test drawing from `faker` can't shift what the seed produces. */
export const faker = new Faker({ locale: [en, base] });
faker.seed(FAKER_SEED);

const usedUniqueValues = new Set<unknown>();

const seededFakers: Faker[] = [faker];

/** A deterministic faker for another locale, reseeded by `resetFaker` with the rest. */
export function createSeededFaker(
	locale: ConstructorParameters<typeof Faker>[0]["locale"],
) {
	const instance = new Faker({ locale });
	instance.seed(FAKER_SEED);
	seededFakers.push(instance);

	return instance;
}

/** Draws from `generate` until unique (e.g. a Discord name). Unique-constrained values should derive from `seq` instead. */
export function unique<T>(generate: () => T): T {
	for (let attempt = 0; attempt < MAX_UNIQUE_ATTEMPTS; attempt++) {
		const value = generate();

		if (!usedUniqueValues.has(value)) {
			usedUniqueValues.add(value);

			return value;
		}
	}

	throw new Error(
		`Could not draw a unique value in ${MAX_UNIQUE_ATTEMPTS} attempts`,
	);
}

/** Reseeds every faker instance and forgets every value drawn via `unique`. */
export function resetFaker() {
	for (const instance of seededFakers) {
		instance.seed(FAKER_SEED);
	}
	usedUniqueValues.clear();
}
