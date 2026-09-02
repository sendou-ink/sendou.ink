import type { Locator, Page } from "@playwright/test";

/**
 * The chat sidebar and the chats open inside it. The same component renders in the desktop
 * rail, the tablet modal or the mobile panel, never more than one at a time, so the accessors
 * find their elements wherever the viewport put them instead of scoping to a container.
 */
export class ChatSidebar {
	readonly locators;

	constructor(page: Page) {
		this.locators = {
			/** Only rendered while the chat is closed in the desktop layout. */
			toggleButton: page.locator('[data-testid="chat-toggle-button"]:visible'),
			toggleUnreadBadge: page.locator("[class*='chatUnreadBadge']:visible"),
			/** The tablet layout's chat, which is a modal rather than a rail. */
			modal: page.getByRole("dialog", { name: "Chat" }),
			closeButton: page.locator("button[class*='closeButton']:visible"),
			// the badge inside it is a span, the back control itself a button
			backButton: page.locator("button[class*='backButton']:visible"),
			roomRows: page.locator("[class*='roomItem']:visible"),
			emptyState: page.locator("[class*='emptyState']:visible"),
			inactiveToggle: page.locator("[class*='inactiveToggle']:visible"),
			headerTitle: page.locator("[class*='chatHeaderTitle']:visible"),
			headerSubtitle: page.locator("[class*='chatHeaderSubtitle']:visible"),
			headerLink: page.locator("a[class*='chatHeaderLink']:visible"),
			/** Every chat open: one on its own, or one per panel of the split view. */
			openChats: page.locator("[class*='chatContainer']:visible"),
			// splitPanelHeader would match the panel selector too
			splitPanels: page.locator(
				"[class*='splitPanel']:not([class*='splitPanelHeader']):visible",
			),
			splitPanelHeaders: page.locator("[class*='splitPanelHeader']:visible"),
		};
	}

	async open() {
		await this.locators.toggleButton.click();
	}

	async close() {
		await this.locators.closeButton.click();
	}

	/** Leaves the open room (or split view) for the room list. */
	async backToRoomList() {
		await this.locators.backButton.click();
	}

	/** Follows the open room's header link to the page the room belongs to. */
	async followRoomLink() {
		await this.locators.headerLink.click();
	}

	roomRow(title: string) {
		return this.locators.roomRows.filter({ hasText: title });
	}

	roomRowUnreadBadge(title: string) {
		return this.roomRow(title).locator("[class*='unreadBadge']");
	}

	async openRoom(title: string) {
		await this.roomRow(title).click();
	}

	/** One open chat: the only one, or the nth panel of the split view (match chat first, group chat below). */
	chat(nth = 0) {
		return new ChatRoom(this.locators.openChats.nth(nth));
	}
}

/** The messages and composer of one open chat. */
class ChatRoom {
	private readonly root: Locator;
	readonly locators;

	constructor(root: Locator) {
		this.root = root;
		this.locators = {
			messages: root.getByRole("option"),
			/** Sent messages still waiting for the echo or the POST response. */
			pendingMessages: root.locator("[class*='messageContentsPending']"),
			composer: root.getByPlaceholder("Press enter to send"),
			sendButton: root.getByTestId("chat-submit-button"),
			readOnlyNote: root.getByText("Read-only"),
			expiredNote: root.getByText("Room expired, now read-only"),
		};
	}

	message(text: string | RegExp) {
		return this.locators.messages.filter({ hasText: text });
	}

	/** The role badge (e.g. "TO") a non-participant author's message is marked with. */
	authorLabel(label: string) {
		return this.root.locator("[class*='avatarBadge']", { hasText: label });
	}

	async send(contents: string) {
		await this.locators.composer.fill(contents);
		await this.locators.composer.press("Enter");
	}
}
