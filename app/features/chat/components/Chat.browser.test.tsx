import * as React from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import type { ChatMessage, ChatUser } from "../chat-types";
import { Chat, type ChatAdapter } from "./Chat";

vi.mock("~/features/auth/core/user", () => ({
	useUser: () => null,
}));

const USERS: Record<number, ChatUser> = {
	1: {
		username: "Alice",
		discordId: "1",
		discordAvatar: null,
		pronouns: null,
		customAvatarUrl: null,
		chatNameHue: null,
	},
};

function createMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
	return {
		id: "1",
		userId: 1,
		contents: "Hello world",
		timestamp: 1700000000000,
		room: "room",
		...overrides,
	};
}

function renderChat(
	messages: ChatMessage[],
	props?: { missingUserName?: string },
) {
	const chat: ChatAdapter = {
		messages,
		send: () => {},
		currentRoom: "room",
		setCurrentRoom: () => {},
		readyState: "CONNECTED",
		unseenMessages: new Map(),
	};

	const router = createMemoryRouter(
		[
			{
				path: "/",
				element: (
					<div style={{ width: 400 }}>
						<Chat
							users={USERS}
							rooms={[]}
							chat={chat}
							missingUserName={props?.missingUserName}
						/>
					</div>
				),
			},
		],
		{ initialEntries: ["/"] },
	);

	return render(<RouterProvider router={router} />);
}

async function renderChatWithControls(initialMessages: ChatMessage[]) {
	const controls = {
		addMessage: (_msg: ChatMessage) => {},
	};

	function ChatHarness() {
		const [messages, setMessages] = React.useState(initialMessages);
		controls.addMessage = (msg) => setMessages((prev) => [...prev, msg]);

		const chat: ChatAdapter = {
			messages,
			send: () => {},
			currentRoom: "room",
			setCurrentRoom: () => {},
			readyState: "CONNECTED",
			unseenMessages: new Map(),
		};

		return (
			<div style={{ width: 400 }}>
				<Chat users={USERS} rooms={[]} chat={chat} />
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
		createMessage({ id: String(i + 1), contents: `Message ${i + 1}` }),
	);
}

function isScrolledToBottom(element: HTMLElement) {
	return element.scrollTop + element.clientHeight >= element.scrollHeight - 2;
}

describe("Chat", () => {
	test("renders messages inside a virtualized listbox", async () => {
		const screen = await renderChat([
			createMessage({ id: "1", contents: "First message" }),
			createMessage({ id: "2", contents: "Second message" }),
		]);

		await expect.element(screen.getByRole("listbox")).toBeInTheDocument();
		await expect.element(screen.getByText("First message")).toBeInTheDocument();
		await expect
			.element(screen.getByText("Second message"))
			.toBeInTheDocument();
		expect(screen.getByRole("option").elements()).toHaveLength(2);
	});

	test("virtualizes a long list into a scrollable region taller than its viewport", async () => {
		const screen = await renderChat(
			Array.from({ length: 100 }, (_, i) =>
				createMessage({ id: String(i + 1), contents: `Message ${i + 1}` }),
			),
		);

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

	test("renders system messages", async () => {
		const screen = await renderChat([
			createMessage({
				id: "1",
				type: "USER_LEFT",
				contents: undefined,
				userId: undefined,
				context: { name: "Bob" },
			}),
		]);

		await expect
			.element(screen.getByText("Bob left the group"))
			.toBeInTheDocument();
	});

	test("skips messages with an unknown user when no fallback name is given", async () => {
		const screen = await renderChat([
			createMessage({ id: "1", userId: 999, contents: "Ghost message" }),
		]);

		await expect.element(screen.getByRole("listbox")).toBeInTheDocument();
		expect(screen.getByRole("option").elements()).toHaveLength(0);
	});

	test("renders messages with an unknown user using the fallback name", async () => {
		const screen = await renderChat(
			[createMessage({ id: "1", userId: 999, contents: "Ghost message" })],
			{ missingUserName: "Unknown" },
		);

		await expect.element(screen.getByText("Ghost message")).toBeInTheDocument();
		await expect.element(screen.getByText("Unknown")).toBeInTheDocument();
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
				id: "new",
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

		controls.addMessage(createMessage({ id: "new", contents: "While away" }));

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

		controls.addMessage(createMessage({ id: "new", contents: "While away" }));

		await expect.element(screen.getByText("New messages")).toBeInTheDocument();
		await new Promise((resolve) => setTimeout(resolve, 300));
		expect(element.scrollTop).toBe(readingPosition);
	});
});
