import { en, Faker } from "@faker-js/faker";

const FAKER_SEED = 5800;
const MAX_UNIQUE_ATTEMPTS = 100;

/**
 * Faker instance dedicated to seeding. Deliberately not the global singleton, so
 * that app code or a test drawing from `faker` cannot shift what the seed produces.
 */
export const faker = new Faker({ locale: en });
faker.seed(FAKER_SEED);

const usedUniqueValues = new Set<unknown>();

/**
 * Draws from `generate` until it produces a value that has not been drawn before,
 * for values that should look real but still be unique (e.g. a Discord name).
 * Values with a unique constraint should be derived from the factory's `seq` instead.
 */
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

/** Reseeds the faker instance and forgets every value drawn via `unique`. */
export function resetFaker() {
	faker.seed(FAKER_SEED);
	usedUniqueValues.clear();
}
