import type * as React from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { SendouDialog } from "./Dialog";

let cleanupFns: Array<() => void> = [];

afterEach(() => {
	for (const cleanup of cleanupFns) {
		cleanup();
	}
	cleanupFns = [];
});

function withRouter(element: React.ReactElement) {
	const router = createMemoryRouter([{ path: "*", element }], {
		initialEntries: ["/"],
	});
	return <RouterProvider router={router} />;
}

function openDialog() {
	const dialog = document.querySelector("dialog");
	if (!dialog) throw new Error("no dialog rendered");
	return dialog;
}

function clickDialogAt(dialog: HTMLDialogElement, x: number, y: number) {
	dialog.dispatchEvent(
		new MouseEvent("click", { bubbles: true, clientX: x, clientY: y }),
	);
}

describe("SendouDialog", () => {
	test("closes a dismissable dialog on a backdrop click", async () => {
		const onClose = vi.fn();
		await render(
			withRouter(
				<SendouDialog heading="Hello" isDismissable onClose={onClose}>
					Content
				</SendouDialog>,
			),
		);
		await expect.element(page.getByText("Content")).toBeVisible();

		const dialog = openDialog();
		const rect = dialog.getBoundingClientRect();
		clickDialogAt(dialog, rect.right + 5, rect.bottom + 5);

		await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce());
		expect(dialog.open).toBe(false);
	});

	test("keeps a dismissable dialog open on a click inside its box", async () => {
		const onClose = vi.fn();
		await render(
			withRouter(
				<SendouDialog heading="Hello" isDismissable onClose={onClose}>
					Content
				</SendouDialog>,
			),
		);
		await expect.element(page.getByText("Content")).toBeVisible();

		const dialog = openDialog();
		const rect = dialog.getBoundingClientRect();
		clickDialogAt(dialog, rect.left + 1, rect.top + 1);

		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(onClose).not.toHaveBeenCalled();
		expect(dialog.open).toBe(true);
	});

	test("trigger opens the dialog and the close button closes it", async () => {
		const screen = await render(
			withRouter(
				<SendouDialog
					heading="Hello"
					trigger={<button type="button">Open</button>}
					showCloseButton
				>
					Content
				</SendouDialog>,
			),
		);

		await screen.getByRole("button", { name: "Open" }).click();
		await expect.element(screen.getByText("Content")).toBeVisible();

		await screen.getByRole("button", { name: "Close" }).click();
		await expect.element(screen.getByText("Content")).not.toBeVisible();
	});

	test("adopts a lazy dialog opened before hydration and mounts its content", async () => {
		const app = withRouter(
			<SendouDialog
				heading="Hello"
				trigger={<button type="button">Open</button>}
				lazy
			>
				Lazy content
			</SendouDialog>,
		);

		const container = document.createElement("div");
		container.innerHTML = renderToString(app);
		document.body.appendChild(container);
		cleanupFns.push(() => container.remove());
		expect(container.textContent).not.toContain("Lazy content");

		openDialog().showModal();
		const root = hydrateRoot(container, app);
		cleanupFns.push(() => root.unmount());

		await expect.element(page.getByText("Lazy content")).toBeVisible();
		expect(openDialog().open).toBe(true);
	});

	test("locks page scrolling while open without changing the page width", async () => {
		const tall = document.createElement("div");
		tall.style.height = "300vh";
		document.body.appendChild(tall);
		cleanupFns.push(() => tall.remove());
		const root = document.documentElement;
		const widthBefore = root.clientWidth;

		const screen = await render(
			withRouter(
				<SendouDialog
					heading="Hello"
					trigger={<button type="button">Open</button>}
					showCloseButton
				>
					Content
				</SendouDialog>,
			),
		);

		await screen.getByRole("button", { name: "Open" }).click();
		await expect.element(screen.getByText("Content")).toBeVisible();
		await vi.waitFor(() => expect(root.style.overflow).toBe("hidden"));
		expect(root.clientWidth).toBe(widthBefore);

		await screen.getByRole("button", { name: "Close" }).click();
		await vi.waitFor(() => expect(root.style.overflow).toBe(""));
		expect(root.style.scrollbarGutter).toBe("");
		expect(root.clientWidth).toBe(widthBefore);
	});

	test("releases the scroll lock when an open dialog unmounts", async () => {
		const screen = await render(
			withRouter(
				<SendouDialog heading="Hello" onClose={() => {}}>
					Content
				</SendouDialog>,
			),
		);
		await expect.element(screen.getByText("Content")).toBeVisible();
		await vi.waitFor(() =>
			expect(document.documentElement.style.overflow).toBe("hidden"),
		);

		await screen.unmount();
		expect(document.documentElement.style.overflow).toBe("");
	});

	test("focuses the dialog itself instead of the close button on open", async () => {
		await render(
			withRouter(
				<SendouDialog heading="Hello" onClose={() => {}}>
					<button type="button">Action</button>
				</SendouDialog>,
			),
		);
		await expect.element(page.getByText("Action")).toBeVisible();

		expect(document.activeElement).toBe(openDialog());
	});

	test("focuses the dialog itself when opened by its trigger", async () => {
		const screen = await render(
			withRouter(
				<SendouDialog
					heading="Hello"
					trigger={<button type="button">Open</button>}
					showCloseButton
				>
					Content
				</SendouDialog>,
			),
		);

		await screen.getByRole("button", { name: "Open" }).click();
		await expect.element(screen.getByText("Content")).toBeVisible();

		await vi.waitFor(() => expect(document.activeElement).toBe(openDialog()));
	});
});
