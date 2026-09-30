import type * as React from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { MobileNav } from "./MobileNav";

let cleanupFns: Array<() => void> = [];

beforeEach(async () => {
	await page.viewport(375, 667);
});

afterEach(() => {
	for (const cleanup of cleanupFns) {
		cleanup();
	}
	cleanupFns = [];
});

describe("MobileNav", () => {
	test("does not cover the consent dialog's buttons", async () => {
		await render(withRouter(<MobileNav sidebarData={undefined} />));
		const bar = mobileNav();
		await vi.waitFor(() => expect(bar.matches(":popover-open")).toBe(true));

		const consentButton = renderConsentDialogStandIn();

		expect(topmostElementAt(consentButton)).toBe(consentButton);
	});
});

function withRouter(element: React.ReactElement) {
	const router = createMemoryRouter([{ path: "*", element }], {
		initialEntries: ["/"],
	});
	return <RouterProvider router={router} />;
}

function mobileNav() {
	const bar = document.getElementById("mobile-nav");
	if (!bar) throw new Error("no mobile nav rendered");
	return bar;
}

/**
 * Stands in for the consent dialog: a full screen box of the consent platform's
 * own making, holding the buttons at its bottom edge, right where the bar is.
 */
function renderConsentDialogStandIn() {
	const sheet = document.createElement("style");
	sheet.textContent = `.qc-cmp-cleanslate.qc-cmp-cleanslate {
		position: fixed;
		inset: 0;
		height: 100%;
		z-index: 2147483647;
		display: flex;
		align-items: flex-end;
	}`;
	document.head.append(sheet);

	const container = document.createElement("div");
	container.id = "qc-cmp2-container";
	container.innerHTML =
		'<div class="qc-cmp2-main"><div class="qc-cmp-cleanslate">' +
		'<button type="button" style="width: 100%; height: 40px">Agree</button>' +
		"</div></div>";
	document.body.prepend(container);

	cleanupFns.push(() => {
		container.remove();
		sheet.remove();
	});

	const button = container.querySelector("button");
	if (!button) throw new Error("no stand-in button rendered");

	return button;
}

function topmostElementAt(element: HTMLElement) {
	const rect = element.getBoundingClientRect();

	return document.elementFromPoint(
		rect.left + rect.width / 2,
		rect.top + rect.height / 2,
	);
}
