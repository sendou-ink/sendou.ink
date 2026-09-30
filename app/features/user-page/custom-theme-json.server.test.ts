import { describe, expect, test } from "vitest";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as ThemePalette from "~/features/theme/core/ThemePalette";
import * as UserRepository from "./UserRepository.server";

const CUSTOM_THEME = ThemePalette.build({
	baseHue: 268,
	baseChroma: 0.05,
	accentHue: 253,
	accentChroma: 0.24,
	bgLightness: 0.17,
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

		const layoutData = await UserRepository.findLayoutDataById(user.id);

		// `root.tsx` spreads the object into CSS variables, so a raw string renders as garbage
		expect(layoutData?.customTheme?.["--_acc-h"]).toBe(
			CUSTOM_THEME["--_acc-h"],
		);
	});

	test("is null for a user who is not a supporter", async () => {
		const user = await UserFactory.create(null, {
			customTheme: CUSTOM_THEME,
		});

		const layoutData = await UserRepository.findLayoutDataById(user.id);

		expect(layoutData?.customTheme).toBeNull();
	});
});
