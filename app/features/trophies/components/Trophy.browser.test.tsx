import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { compressTrophyModel } from "../trophies-utils";
import { Trophy, TrophyContextProvider } from "./Trophy";

vi.mock("picocad2-web", () => ({
	PicoCAD2Context: class {
		constructor() {
			throw new Error("WebGL 2 is not supported");
		}
	},
	PicoCAD2Viewer: class {},
}));

vi.mock("~/features/theme/core/provider", () => ({
	useTheme: () => ({ userTheme: "auto", htmlThemeClass: "" }),
}));

const MODEL = compressTrophyModel("{}");
const UNSUPPORTED_LABEL =
	"Your browser can't display trophies. Check that hardware acceleration and WebGL are turned on.";

describe("Trophy", () => {
	test("shows a placeholder instead of crashing when the browser can't create a WebGL 2 context", async () => {
		const screen = await render(
			<TrophyContextProvider>
				<Trophy model={MODEL} tier={1} />
				<Trophy model={MODEL} pill="1st" />
			</TrophyContextProvider>,
		);

		await expect
			.poll(() => screen.getByRole("img", { name: UNSUPPORTED_LABEL }).all())
			.toHaveLength(2);
		expect(screen.container.querySelector("canvas")).toBeNull();
		await expect.element(screen.getByTestId("confirmed-tier")).toBeVisible();
		await expect
			.element(screen.getByTestId("trophy-corner-pill"))
			.toHaveTextContent("1st");
	});

	test("spells out why under the placeholder with showUnsupportedText", async () => {
		const screen = await render(<Trophy model={MODEL} showUnsupportedText />);

		await expect.element(screen.getByText(UNSUPPORTED_LABEL)).toBeVisible();
	});

	test("keeps the explanation in the tooltip only without showUnsupportedText", async () => {
		const screen = await render(<Trophy model={MODEL} />);

		await expect
			.element(screen.getByRole("img", { name: UNSUPPORTED_LABEL }))
			.toHaveAttribute("title", UNSUPPORTED_LABEL);
		expect(screen.getByText(UNSUPPORTED_LABEL).query()).toBeNull();
	});

	test("shows a placeholder outside a provider too", async () => {
		const screen = await render(<Trophy model={MODEL} />);

		await expect
			.element(screen.getByRole("img", { name: UNSUPPORTED_LABEL }))
			.toBeVisible();
		expect(screen.container.querySelector("canvas")).toBeNull();
	});
});
