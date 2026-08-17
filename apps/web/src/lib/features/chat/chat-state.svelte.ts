/**
 * Client-side chat UI state shared between the layout (sidebar/mobile panel)
 * and pages that carry a chat room (e.g. a booked scrim). Written only from
 * client-side lifecycles, so the module-level state can't leak between
 * server-rendered requests.
 */

class ChatUiState {
	/** Whether the desktop chat sidebar is open. */
	sidebarOpen = $state(false);
	/** The room the current route belongs to (a scrim page sets this on mount). */
	routeChatRoomId = $state<number | null>(null);
	/** The room opened in the sidebar's single-room view. */
	openRoomId = $state<number | null>(null);

	toggleSidebar() {
		this.sidebarOpen = !this.sidebarOpen;
		if (this.sidebarOpen && this.routeChatRoomId !== null) {
			this.openRoomId = this.routeChatRoomId;
		}
	}
}

export const chatUi = new ChatUiState();
