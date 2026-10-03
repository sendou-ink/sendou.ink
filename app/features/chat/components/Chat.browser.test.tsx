import * as React from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import type { EventsReadyState } from "~/features/events/events-client";
import type { ChatMessageAuthor, ClientChatMessage } from "../chat-types";
import { Chat } from "./Chat";

const CONNECTION_STATUS_GRACE_MS = 1_500;

vi.mock("~/features/auth/core/user", () => ({
	useUser: () => null,
}));

// the composer only sends over a live event stream, which the tests have none of
const readyStateStore = vi.hoisted(() => {
	let current = "CONNECTED";
	const listeners = new Set<() => void>();

	return {
		get: () => current,
		set: (next: string) => {
			current = next;
			for (const listener of listeners) listener();
		},
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
});

vi.mock("~/features/events/events-hooks", async (importOriginal) => {
	const react = await import("react");

	return {
		...(await importOriginal<
			typeof import("~/features/events/events-hooks")
		>()),
		useEventsReadyState: () =>
			react.useSyncExternalStore(
				readyStateStore.subscribe,
				readyStateStore.get,
			),
	};
});

const setReadyState = (next: EventsReadyState) => readyStateStore.set(next);

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

afterEach(() => {
	setReadyState("CONNECTED");
});

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
	test("renders messages inside a virtualized log", async () => {
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

		await expect.element(screen.getByRole("log")).toBeInTheDocument();
		await expect.element(screen.getByText("First message")).toBeInTheDocument();
		await expect
			.element(screen.getByText("Second message"))
			.toBeInTheDocument();
		expect(screen.getByTestId("chat-message-row").elements()).toHaveLength(2);
	});

	test("virtualizes a long list into a scrollable region taller than its viewport", async () => {
		const screen = await renderChat(manyMessages(100));

		const log = screen.getByRole("log").element() as HTMLElement;
		await expect.element(screen.getByRole("log")).toBeInTheDocument();

		const scrollContent = log.querySelector(
			":scope > div",
		) as HTMLElement | null;
		const messageRow = log.querySelector(
			"[data-testid=chat-message-row]",
		) as HTMLElement | null;

		expect(scrollContent).not.toBeNull();
		expect(scrollContent!.offsetHeight).toBeGreaterThan(log.clientHeight);
		expect(getComputedStyle(messageRow!).position).toBe("absolute");
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
		expect(
			screen.getByPlaceholder("Press enter to send").elements(),
		).toHaveLength(0);
	});

	test("sends the draft on enter and clears the composer", async () => {
		const onSend = vi.fn();
		const screen = await renderChat([createMessage()], { onSend });

		const composer = screen.getByPlaceholder("Press enter to send");
		await composer.fill("hello there");
		await userEvent.keyboard("{Enter}");

		expect(onSend).toHaveBeenCalledWith({
			publicId: expect.any(String),
			contents: "hello there",
		});
		await expect.element(composer).toHaveValue("");
	});

	test("a blank draft is not sent", async () => {
		const onSend = vi.fn();
		const screen = await renderChat([createMessage()], { onSend });

		const composer = screen.getByPlaceholder("Press enter to send");
		await composer.fill("   ");
		await userEvent.keyboard("{Enter}");

		expect(onSend).not.toHaveBeenCalled();
	});

	test("offers retrying a failed send, not one still pending", async () => {
		const onRetry = vi.fn();
		const screen = await renderChat(
			[
				createMessage({
					id: 0,
					publicId: "failed1234",
					contents: "Lost",
					pending: true,
					failed: true,
				}),
				createMessage({
					id: 0,
					publicId: "pending123",
					contents: "On its way",
					pending: true,
				}),
			],
			{ onRetry },
		);

		const retryButtons = screen.getByRole("button", {
			name: "Not sent, retry",
		});
		await expect.element(retryButtons).toBeInTheDocument();
		expect(retryButtons.elements()).toHaveLength(1);

		await retryButtons.click();
		expect(onRetry).toHaveBeenCalledWith("failed1234");
	});

	describe("mentions", () => {
		const BOB = { ...ALICE, id: 2, username: "Bob", discordId: "2" };
		const CAROL = { ...ALICE, id: 3, username: "Carol", discordId: "3" };

		const renderComposer = async () => {
			const onSend = vi.fn();
			const screen = await renderChat([createMessage()], {
				onSend,
				mentionableUsers: [BOB, CAROL],
			});
			const composer = screen.getByPlaceholder("Press enter to send");
			await composer.click();

			return { screen, composer, onSend };
		};

		test("renders mention tokens as the mentioned users' names", async () => {
			const screen = await renderChat(
				[createMessage({ contents: "gg <mention-2> and <mention-99>" })],
				{ mentionableUsers: [BOB] },
			);

			await expect.element(screen.getByText("@Bob")).toBeInTheDocument();
			await expect
				.element(screen.getByText("@unknown user"))
				.toBeInTheDocument();
		});

		test("picks a suggestion with the keyboard and sends it as a token", async () => {
			const { screen, composer, onSend } = await renderComposer();

			await userEvent.keyboard("hi @ca");
			await expect
				.element(screen.getByRole("option", { name: "Carol" }))
				.toBeVisible();
			await userEvent.keyboard("{Enter}");
			await expect.element(composer).toHaveValue("hi @Carol ");

			await userEvent.keyboard("gg{Enter}");
			expect(onSend).toHaveBeenCalledWith({
				publicId: expect.any(String),
				contents: "hi <mention-3> gg",
			});
		});

		test("suggests the room's users and message authors, the arrow keys moving through them", async () => {
			const { screen } = await renderComposer();

			await userEvent.keyboard("@");
			expect(
				screen
					.getByRole("option")
					.elements()
					.map((option) => option.textContent),
			).toEqual(["Bob", "Carol", "Alice"]);

			await userEvent.keyboard("{ArrowDown}");
			await expect
				.element(screen.getByRole("option", { name: "Carol" }))
				.toHaveAttribute("aria-selected", "true");
		});

		test("sends the picked one of two users sharing a name", async () => {
			const otherBob = { ...BOB, id: 5, discordId: "5" };
			const onSend = vi.fn();
			const screen = await renderChat([], {
				onSend,
				mentionableUsers: [BOB, otherBob],
			});
			await screen.getByPlaceholder("Press enter to send").click();

			await userEvent.keyboard("@bo");
			await expect.element(screen.getByRole("listbox")).toBeVisible();
			await userEvent.keyboard("{ArrowDown}{Enter}");
			await userEvent.keyboard("and @bo{Enter}{Enter}");

			expect(onSend).toHaveBeenCalledWith({
				publicId: expect.any(String),
				contents: "<mention-5> and <mention-2>",
			});
		});

		test("closes the suggestions on escape", async () => {
			const { screen } = await renderComposer();

			await userEvent.keyboard("@");
			await expect.element(screen.getByRole("listbox")).toBeVisible();

			await userEvent.keyboard("{Escape}");
			expect(screen.getByRole("option").elements()).toHaveLength(0);
		});

		test("picks a suggestion by clicking it", async () => {
			const { screen, composer } = await renderComposer();

			await userEvent.keyboard("@b");
			await screen.getByRole("option", { name: "Bob" }).click();

			await expect.element(composer).toHaveValue("@Bob ");
			await expect.element(composer).toHaveFocus();
		});
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
		expect(
			screen.getByTestId("chat-message-row").element().textContent,
		).toContain("join here");
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

		const log = screen.getByRole("log");
		await expect.element(log).toBeInTheDocument();

		await vi.waitFor(() => {
			const element = log.element() as HTMLElement;
			expect(element.scrollHeight).toBeGreaterThan(element.clientHeight);
			expect(isScrolledToBottom(element)).toBe(true);
		});
	});

	test("auto scrolls when a new message arrives while at the bottom", async () => {
		const { screen, controls } = await renderChatWithControls(manyMessages(50));

		const log = screen.getByRole("log");
		await vi.waitFor(() => {
			expect(isScrolledToBottom(log.element() as HTMLElement)).toBe(true);
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
			expect(isScrolledToBottom(log.element() as HTMLElement)).toBe(true);
		});
	});

	test("does not auto scroll when scrolled up, shows the new messages button instead", async () => {
		const { screen, controls } = await renderChatWithControls(manyMessages(50));

		const log = screen.getByRole("log");
		await vi.waitFor(() => {
			expect(isScrolledToBottom(log.element() as HTMLElement)).toBe(true);
		});

		const element = log.element() as HTMLElement;
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

	test("opens at the unread divider when the unread messages don't fit on screen", async () => {
		const screen = await renderChat(manyMessages(100), {
			firstUnreadMessageId: 31,
		});

		const divider = screen.getByTestId("chat-unread-divider");
		await expect.element(divider).toBeInTheDocument();

		const log = screen.getByRole("log").element() as HTMLElement;
		await vi.waitFor(() => {
			const dividerTop =
				divider.element().getBoundingClientRect().top -
				log.getBoundingClientRect().top;
			expect(dividerTop).toBeGreaterThanOrEqual(0);
			expect(dividerTop).toBeLessThan(log.clientHeight / 2);
		});
		expect(isScrolledToBottom(log)).toBe(false);
		await expect
			.element(screen.getByText("Message 31", { exact: true }))
			.toBeInTheDocument();
	});

	test("stays at the end with the divider in view when the unread messages fit on screen", async () => {
		const screen = await renderChat(manyMessages(100), {
			firstUnreadMessageId: 99,
		});

		await expect
			.element(screen.getByTestId("chat-unread-divider"))
			.toBeInTheDocument();
		const log = screen.getByRole("log").element() as HTMLElement;
		await vi.waitFor(() => {
			expect(isScrolledToBottom(log)).toBe(true);
		});
	});

	test("keeps the reading position when a new message arrives while scrolled up", async () => {
		const { screen, controls } = await renderChatWithControls(manyMessages(50));

		const log = screen.getByRole("log");
		await vi.waitFor(() => {
			expect(isScrolledToBottom(log.element() as HTMLElement)).toBe(true);
		});

		const element = log.element() as HTMLElement;
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

	test("says the stream is down only once it has been down for the grace period", async () => {
		const screen = await renderChat([createMessage()]);

		setReadyState("CLOSED");
		await wait(CONNECTION_STATUS_GRACE_MS / 2);
		expect(screen.getByText("Disconnected").elements()).toHaveLength(0);

		await wait(CONNECTION_STATUS_GRACE_MS);
		await expect.element(screen.getByText("Disconnected")).toBeInTheDocument();
	});

	test("never says the stream is down when it reconnects inside the grace period", async () => {
		const screen = await renderChat([createMessage()]);

		setReadyState("CONNECTING");
		await wait(CONNECTION_STATUS_GRACE_MS / 2);
		expect(screen.getByText("Connecting...").elements()).toHaveLength(0);

		setReadyState("CONNECTED");
		await wait(CONNECTION_STATUS_GRACE_MS * 2);
		expect(screen.getByText("Connecting...").elements()).toHaveLength(0);
		expect(screen.getByText("Disconnected").elements()).toHaveLength(0);
	});
});
