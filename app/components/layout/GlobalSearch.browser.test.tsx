import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { GlobalSearch } from "./GlobalSearch";

let hrefBefore = window.location.href;

beforeEach(() => {
	hrefBefore = window.location.href;
});

afterEach(() => {
	window.history.replaceState(null, "", hrefBefore);
});

function pushSearchParamOpen() {
	const url = new URL(window.location.href);
	url.searchParams.set("search", "open");
	window.history.pushState(null, "", url);
}

describe("GlobalSearch", () => {
	test("opens from the search param and closes when navigating back pops it", async () => {
		pushSearchParamOpen();

		const router = createMemoryRouter([
			{ path: "*", element: <GlobalSearch /> },
		]);
		await render(<RouterProvider router={router} />);
		await expect.element(page.getByRole("dialog")).toBeVisible();

		window.history.back();

		await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
	});
});
