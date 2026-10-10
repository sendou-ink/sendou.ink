import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { useMainContentWidth } from "./useMainContentWidth";

function WidthReader({ testId }: { testId: string }) {
	const width = useMainContentWidth();

	return <span data-testid={testId}>{width}</span>;
}

function App({
	page,
	mainWidth,
	withPageReader = true,
}: {
	page: string;
	mainWidth: number;
	withPageReader?: boolean;
}) {
	return (
		<>
			<aside>
				<WidthReader testId="persistent-width" />
			</aside>
			<main key={page} style={{ width: mainWidth }}>
				{withPageReader ? <WidthReader testId="page-width" /> : null}
			</main>
		</>
	);
}

describe("useMainContentWidth", () => {
	test("reports the width of the main element that replaced the one a persistent subscriber started observing", async () => {
		const screen = await render(<App page="match" mainWidth={500} />);

		await expect
			.element(screen.getByTestId("page-width"))
			.toHaveTextContent("500");

		await screen.rerender(<App page="looking" mainWidth={600} />);

		await expect
			.element(screen.getByTestId("page-width"))
			.toHaveTextContent("600");
	});

	test("follows a replaced main element with only a subscriber outside of it", async () => {
		const screen = await render(
			<App page="match" mainWidth={500} withPageReader={false} />,
		);

		await expect
			.element(screen.getByTestId("persistent-width"))
			.toHaveTextContent("500");

		await screen.rerender(
			<App page="looking" mainWidth={600} withPageReader={false} />,
		);

		await expect
			.element(screen.getByTestId("persistent-width"))
			.toHaveTextContent("600");
	});
});
