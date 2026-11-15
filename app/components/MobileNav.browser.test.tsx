import type * as React from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { MobileNav } from "./MobileNav";

const loggedInUser = vi.hoisted(() => ({
	current: null as { id: number; username: string; roles: string[] } | null,
}));

vi.mock("~/features/auth/core/user", () => ({
	useUser: () => loggedInUser.current,
}));

let cleanupFns: Array<() => void> = [];

beforeEach(async () => {
	await page.viewport(375, 667);
});

afterEach(() => {
	loggedInUser.current = null;
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

	test("a panel keeps covering the whole page under an open keyboard, its content starting where the visible part does", async () => {
		await render(withRouter(<MobileNav sidebarData={undefined} />));

		await page.getByRole("button", { name: "Menu" }).click();
		const panel = page.getByRole("dialog", { name: "Menu" });
		await expect.element(panel).toBeVisible();
		simulateOpenKeyboard({ offsetTop: 200, height: 300 });

		const panelRect = panel.element().getBoundingClientRect();
		expect(panelRect.top).toBe(0);
		expect(panelRect.bottom).toBe(window.innerHeight);
		expect(panel.element().firstElementChild!.getBoundingClientRect().top).toBe(
			200,
		);
	});

	test("the chat panel focuses a tapped text field itself, so iOS doesn't scroll the page", async () => {
		loggedInUser.current = { id: 1, username: "Sendou", roles: [] };
		await render(withRouter(<MobileNav sidebarData={undefined} />));

		await page.getByRole("button", { name: "Chat" }).click();
		const panel = page.getByRole("dialog", { name: "Chat" });
		await expect.element(panel).toBeVisible();

		const input = document.createElement("input");
		panel.element().append(input);
		const touchEnd = new Event("touchend", { bubbles: true, cancelable: true });
		input.dispatchEvent(touchEnd);

		expect(touchEnd.defaultPrevented).toBe(true);
		expect(document.activeElement).toBe(input);
	});
});

function simulateOpenKeyboard({
	offsetTop,
	height,
}: {
	offsetTop: number;
	height: number;
}) {
	const root = document.documentElement;
	root.setAttribute("data-keyboard-open", "");
	root.style.setProperty("--visual-viewport-offset-top", `${offsetTop}px`);
	root.style.setProperty("--visual-viewport-height", `${height}px`);

	cleanupFns.push(() => {
		root.removeAttribute("data-keyboard-open");
		root.style.removeProperty("--visual-viewport-offset-top");
		root.style.removeProperty("--visual-viewport-height");
	});
}

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
