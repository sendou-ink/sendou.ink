import { describe, expect, test } from "vitest";
import { countryCodeToTranslatedName } from "./i18n";

describe("countryCodeToTranslatedName()", () => {
	test("returns the translated country name for a valid code", () => {
		const result = countryCodeToTranslatedName({
			countryCode: "FI",
			language: "fi",
		});
		expect(result).toBe("Suomi");
	});

	test("returns the country name in english if the code contains a dash", () => {
		const result = countryCodeToTranslatedName({
			countryCode: "GB-WLS",
			language: "fi",
		});
		expect(result).toBe("Wales");
	});

	test("returns the country code as is for unknown country", () => {
		const result = countryCodeToTranslatedName({
			countryCode: "UNKNOWN",
			language: "en",
		});

		expect(result).toBe("UNKNOWN");
	});

	test("defaults to english for unknown language", () => {
		const result = countryCodeToTranslatedName({
			countryCode: "FI",
			language: "unknown",
		});

		expect(result).toBe("Finland");
	});
});
