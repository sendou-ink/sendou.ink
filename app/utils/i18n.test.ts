import { describe, expect, it } from "vitest";
import { countryCodeToTranslatedName } from "./i18n";

describe("countryCodeToTranslatedName()", () => {
	it("returns the translated country name for a valid code", () => {
		const result = countryCodeToTranslatedName({
			countryCode: "FI",
			language: "fi",
		});
		expect(result).toBe("Suomi");
	});

	it("returns the country code if it contains a dash (Intl.DisplayNames throws)", () => {
		const result = countryCodeToTranslatedName({
			countryCode: "GB-WLS",
			language: "en",
		});
		expect(result).toBe("GB-WLS");
	});

	it("returns the country code as is for unknown country", () => {
		const result = countryCodeToTranslatedName({
			countryCode: "UNKNOWN",
			language: "en",
		});

		expect(result).toBe("UNKNOWN");
	});

	it("defaults to english for unknown language", () => {
		const result = countryCodeToTranslatedName({
			countryCode: "FI",
			language: "unknown",
		});

		expect(result).toBe("Finland");
	});
});
