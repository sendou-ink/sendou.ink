import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { compressTrophyModel } from "../trophies-utils";
import { Trophy, TrophyContextProvider } from "./Trophy";

vi.mock("picocad2-web", () => ({
	PicoCAD2Context: class {},
	PicoCAD2Viewer: class {
		constructor() {
			throw new Error("Could not get 2D canvas context");
		}
	},
}));

vi.mock("~/features/theme/core/provider", () => ({
	useTheme: () => ({ userTheme: "auto", htmlThemeClass: "" }),
}));

const MODEL = compressTrophyModel("{}");
const UNSUPPORTED_LABEL =
	"Your browser can't display trophies. Check that hardware acceleration and WebGL are turned on.";

describe("Trophy", () => {
	test("shows a placeholder instead of crashing when creating the viewer fails", async () => {
		const screen = await render(
			<TrophyContextProvider>
				<Trophy model={MODEL} />
			</TrophyContextProvider>,
		);

		await expect
			.element(screen.getByRole("img", { name: UNSUPPORTED_LABEL }))
			.toBeVisible();
		expect(screen.container.querySelector("canvas")).toBeNull();
	});
});
