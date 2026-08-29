import * as React from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import type { ChatMessageAuthor, ClientChatMessage } from "../chat-types";
import { Chat } from "./Chat";

vi.mock("~/features/auth/core/user", () => ({
	useUser: () => null,
}));

const ALICE: ChatMessageAuthor = {
	id: 1,
	username: "Alice",
	discordId: "1",
	discordAvatar: null,
	customUrl: null,
	customAvatarUrl: null,
	pronouns: null,
	chatNameHue: null,
};

function createMessage(
	overrides: Partial<ClientChatMessage> = {},
): ClientChatMessage {
	return {
		id: 1,
		roomId: 1,
		authorUserId: 1,
		type: null,
		contents: "Hello world",
		publicId: "publicid-1",
		createdAt: 1700000000,
		author: ALICE,
		...overrides,
	};
}

function renderChat(
	messages: ClientChatMessage[],
	props: Partial<React.ComponentProps<typeof Chat>> = {},
) {
	const router = createMemoryRouter(
		[
			{
				path: "/",
				element: (
					<div style={{ width: 400 }}>
						<Chat messages={messages} onSend={() => {}} {...props} />
					</div>
				),
			},
		],
		{ initialEntries: ["/"] },
	);

	return render(<RouterProvider router={router} />);
}

async function renderChatWithControls(initialMessages: ClientChatMessage[]) {
	const controls = {
		addMessage: (_msg: ClientChatMessage) => {},
	};

	function ChatHarness() {
		const [messages, setMessages] = React.useState(initialMessages);
		controls.addMessage = (msg) => setMessages((prev) => [...prev, msg]);

		return (
			<div style={{ width: 400 }}>
				<Chat messages={messages} onSend={() => {}} />
			</div>
		);
	}

	const router = createMemoryRouter([{ path: "/", element: <ChatHarness /> }], {
		initialEntries: ["/"],
	});

	return { screen: await render(<RouterProvider router={router} />), controls };
}

function manyMessages(count: number) {
	return Array.from({ length: count }, (_, i) =>
		createMessage({
			id: i + 1,
			publicId: `publicid-${i + 1}`,
			contents: `Message ${i + 1}`,
		}),
	);
}

function isScrolledToBottom(element: HTMLElement) {
	return element.scrollTop + element.clientHeight >= element.scrollHeight - 2;
}

describe("Chat", () => {
	test("renders messages inside a virtualized listbox", async () => {
		const screen = await renderChat([
			createMessage({
				id: 1,
				publicId: "publicid-1",
				contents: "First message",
			}),
			createMessage({
				id: 2,
				publicId: "publicid-2",
				contents: "Second message",
			}),
		]);

		await expect.element(screen.getByRole("listbox")).toBeInTheDocument();
		await expect.element(screen.getByText("First message")).toBeInTheDocument();
		await expect
			.element(screen.getByText("Second message"))
			.toBeInTheDocument();
		expect(screen.getByRole("option").elements()).toHaveLength(2);
	});

	test("virtualizes a long list into a scrollable region taller than its viewport", async () => {
		const screen = await renderChat(manyMessages(100));

		const listbox = screen.getByRole("listbox").element() as HTMLElement;
		await expect.element(screen.getByRole("listbox")).toBeInTheDocument();

		const scrollContent = listbox.querySelector(
			":scope > [role=presentation]",
		) as HTMLElement | null;
		const messageRow = listbox.querySelector(
			"[role=option]",
		) as HTMLElement | null;

		expect(scrollContent).not.toBeNull();
		expect(scrollContent!.offsetHeight).toBeGreaterThan(listbox.clientHeight);
		expect(getComputedStyle(messageRow!.parentElement!).position).toBe(
			"absolute",
		);
	});

	test("renders system messages with the author interpolated", async () => {
		const screen = await renderChat([
			createMessage({
				type: "USER_LEFT",
				contents: null,
				author: { ...ALICE, username: "Bob" },
			}),
		]);

		await expect
			.element(screen.getByText("Bob left the group"))
			.toBeInTheDocument();
	});

	test("renders no composer for a viewer who may only read the room", async () => {
		const screen = await renderChat([createMessage()], { readOnly: true });

		await expect.element(screen.getByText("Read-only")).toBeInTheDocument();
		expect(screen.getByRole("textbox").elements()).toHaveLength(0);
	});

	test("renders a splatnet room link with its QR code", async () => {
		const url = "https://s.nintendo.com/av5ja/lobby";
		const screen = await renderChat([
			createMessage({ contents: `join here ${url} thanks` }),
		]);

		const link = screen.getByRole("link", { name: url });
		await expect.element(link).toHaveAttribute("href", url);
		await expect.element(link).toHaveAttribute("target", "_blank");
		await expect.element(link).toHaveAttribute("rel", "noopener noreferrer");
		await expect.element(screen.getByRole("img")).toBeInTheDocument();
		expect(screen.getByRole("option").element().textContent).toContain(
			"join here",
		);
	});

	test("renders a deleted account's message with a fallback name", async () => {
		const screen = await renderChat([
			createMessage({ authorUserId: null, author: null, contents: "Ghost" }),
		]);

		await expect.element(screen.getByText("Ghost")).toBeInTheDocument();
		await expect.element(screen.getByText("???")).toBeInTheDocument();
	});

	test("scrolls to the bottom on initial load", async () => {
		const { screen } = await renderChatWithControls(manyMessages(50));

		const listbox = screen.getByRole("listbox");
		await expect.element(listbox).toBeInTheDocument();

		await vi.waitFor(() => {
			const element = listbox.element() as HTMLElement;
			expect(element.scrollHeight).toBeGreaterThan(element.clientHeight);
			expect(isScrolledToBottom(element)).toBe(true);
		});
	});

	test("auto scrolls when a new message arrives while at the bottom", async () => {
		const { screen, controls } = await renderChatWithControls(manyMessages(50));

		const listbox = screen.getByRole("listbox");
		await vi.waitFor(() => {
			expect(isScrolledToBottom(listbox.element() as HTMLElement)).toBe(true);
		});

		controls.addMessage(
			createMessage({
				id: 51,
				publicId: "publicid-new",
				contents:
					"A brand new message that is long enough to wrap onto multiple lines in the chat window",
			}),
		);

		await expect
			.element(screen.getByText(/A brand new message/))
			.toBeInTheDocument();
		await vi.waitFor(() => {
			expect(isScrolledToBottom(listbox.element() as HTMLElement)).toBe(true);
		});
	});

	test("does not auto scroll when scrolled up, shows the new messages button instead", async () => {
		const { screen, controls } = await renderChatWithControls(manyMessages(50));

		const listbox = screen.getByRole("listbox");
		await vi.waitFor(() => {
			expect(isScrolledToBottom(listbox.element() as HTMLElement)).toBe(true);
		});

		const element = listbox.element() as HTMLElement;
		element.dispatchEvent(new WheelEvent("wheel", { deltaY: -100 }));
		element.scrollTop = 0;
		element.dispatchEvent(new Event("scroll"));
		await vi.waitFor(() => {
			expect(element.scrollTop).toBe(0);
		});

		controls.addMessage(
			createMessage({
				id: 51,
				publicId: "publicid-new",
				contents: "While away",
			}),
		);

		await expect.element(screen.getByText("New messages")).toBeInTheDocument();
		expect(isScrolledToBottom(element)).toBe(false);

		await screen.getByText("New messages").click();

		await vi.waitFor(() => {
			expect(isScrolledToBottom(element)).toBe(true);
		});
		await expect
			.element(screen.getByText("New messages"))
			.not.toBeInTheDocument();
	});

	test("keeps the reading position when a new message arrives while scrolled up", async () => {
		const { screen, controls } = await renderChatWithControls(manyMessages(50));

		const listbox = screen.getByRole("listbox");
		await vi.waitFor(() => {
			expect(isScrolledToBottom(listbox.element() as HTMLElement)).toBe(true);
		});

		const element = listbox.element() as HTMLElement;
		const readingPosition = Math.floor(element.scrollHeight / 2);
		element.dispatchEvent(new WheelEvent("wheel", { deltaY: -100 }));
		element.scrollTop = readingPosition;
		element.dispatchEvent(new Event("scroll"));

		await new Promise((resolve) => setTimeout(resolve, 300));

		controls.addMessage(
			createMessage({
				id: 51,
				publicId: "publicid-new",
				contents: "While away",
			}),
		);

		await expect.element(screen.getByText("New messages")).toBeInTheDocument();
		await new Promise((resolve) => setTimeout(resolve, 300));
		expect(element.scrollTop).toBe(readingPosition);
	});
});
