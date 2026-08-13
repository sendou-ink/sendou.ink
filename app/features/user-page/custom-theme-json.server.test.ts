import { describe, expect, test } from "vitest";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { clampThemeToGamut } from "~/utils/oklch-gamut";
import * as UserRepository from "./UserRepository.server";

const CUSTOM_THEME = clampThemeToGamut({
	baseHue: 268,
	baseChroma: 0.05,
	accentHue: 253,
	accentChroma: 0.24,
	chatHue: null,
	radiusBox: 3,
	radiusField: 2,
	radiusSelector: 2,
	borderWidth: 2,
	sizeField: 1,
	sizeSelector: 1,
	sizeSpacing: 1,
});

describe("supporter custom theme on the profile layout", () => {
	test("comes back parsed", async () => {
		const user = await UserFactory.create(null, {
			patronTier: 2,
			customTheme: CUSTOM_THEME,
		});

		const layoutData = await UserRepository.findLayoutDataByIdentifier(
			String(user.id),
		);

		// `root.tsx` spreads `Object.entries(customTheme)` into the page's CSS
		// variables, so a raw string here renders as garbage instead of the theme
		expect(layoutData?.customTheme?.["--_acc-h"]).toBe(
			CUSTOM_THEME["--_acc-h"],
		);
	});

	test("is null for a user who is not a supporter", async () => {
		const user = await UserFactory.create(null, {
			customTheme: CUSTOM_THEME,
		});

		const layoutData = await UserRepository.findLayoutDataByIdentifier(
			String(user.id),
		);

		expect(layoutData?.customTheme).toBeNull();
	});
});
