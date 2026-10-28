const LANGUAGE_TAG_REGEX = /^[a-zA-Z]{1,8}(-[a-zA-Z0-9]{1,8})*$/;
const REGION_SUBTAG_REGEX = /^([a-z]{2}|\d{3})$/;

/** Regional variants of a language in order of preference for a region */
const REGIONAL_VARIANTS: Record<string, (region?: string) => string[]> = {
	es: (region) =>
		!region || region === "es" ? ["es-ES", "es-US"] : ["es-US", "es-ES"],
	fr: (region) => (region === "ca" ? ["fr-CA", "fr-EU"] : ["fr-EU", "fr-CA"]),
};

/**
 * Language tags of an `Accept-Language` header, most preferred first.
 *
 * @example
 * LanguageDetection.acceptedLanguages("fr-CH, fr;q=0.9, en;q=0.8"); // ["fr-CH", "fr", "en"]
 */
export function acceptedLanguages(header: string | null): string[] {
	if (!header) return [];

	return header
		.split(",")
		.map((part) => {
			const [tag, ...parameters] = part.trim().split(";");
			const quality = parameters
				.map((parameter) => parameter.trim().match(/^q=([01](\.\d+)?)$/))
				.find(Boolean)?.[1];

			return { tag: tag.trim(), quality: quality ? Number(quality) : 1 };
		})
		.filter(({ tag, quality }) => LANGUAGE_TAG_REGEX.test(tag) && quality > 0)
		.sort((a, b) => b.quality - a.quality)
		.map(({ tag }) => tag);
}

/**
 * The supported language matching the first candidate language tag any of them matches, `null` if none does.
 * Candidates that aren't strings (e.g. an undecodable cookie) are skipped.
 * Regional variants are told apart by region: Spanish from Spain or without a region gets `es-ES`, other Spanish
 * `es-US`; French from Canada gets `fr-CA`, other French `fr-EU`.
 *
 * @example
 * LanguageDetection.match(["pt-BR", "es-MX", "en"], ["en", "es-ES", "es-US"]); // "es-US"
 */
export function match<T extends string>(
	candidates: unknown[],
	supported: readonly T[],
): T | null {
	for (const candidate of candidates) {
		if (typeof candidate !== "string" || !candidate) continue;

		const matched = matchOne(candidate, supported);
		if (matched) return matched;
	}

	return null;
}

function matchOne<T extends string>(tag: string, supported: readonly T[]) {
	const normalized = tag.toLowerCase();

	const exact = supported.find((code) => code.toLowerCase() === normalized);
	if (exact) return exact;

	const [base, ...subtags] = normalized.split("-");
	const region = subtags.find((subtag) => REGION_SUBTAG_REGEX.test(subtag));

	const sameLanguage = supported.filter(
		(code) => code.toLowerCase().split("-")[0] === base,
	);
	const preferredVariant = REGIONAL_VARIANTS[base]?.(region).find(
		(code): code is T => sameLanguage.includes(code as T),
	);

	return preferredVariant ?? sameLanguage[0] ?? null;
}
