import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, render, screen, waitFor } from "@testing-library/react";
import { createBrowserRouter, RouterProvider } from "react-router";
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

		const router = createBrowserRouter([
			{ path: "*", element: <GlobalSearch /> },
		]);
		render(<RouterProvider router={router} />);
		expect(await screen.findByRole("dialog")).toBeVisible();

		await act(async () => {
			const popped = new Promise((resolve) =>
				window.addEventListener("popstate", resolve, { once: true }),
			);
			window.history.back();
			await popped;
		});

		await waitFor(() =>
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
		);
	});
});
