import * as React from "react";
import { Placeholder } from "../Placeholder";

const ChatSidebar = React.lazy(() =>
	import("./ChatSidebar").then((module) => ({ default: module.ChatSidebar })),
);

export function preloadChatSidebar() {
	void import("./ChatSidebar");
}

export function LazyChatSidebar({ onClose }: { onClose?: () => void }) {
	return (
		<React.Suspense fallback={<Placeholder />}>
			<ChatSidebar onClose={onClose} />
		</React.Suspense>
	);
}
