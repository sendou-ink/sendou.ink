import * as React from "react";

// lazy loaded so the chat code and its dependencies (e.g. qrcode.react) stay
// out of the eager bundle loaded on every page
const ChatSidebarImpl = React.lazy(() =>
	import("./ChatSidebar").then((module) => ({ default: module.ChatSidebar })),
);

// xxx: better loading state?
export function LazyChatSidebar({ onClose }: { onClose?: () => void }) {
	return (
		<React.Suspense>
			<ChatSidebarImpl onClose={onClose} />
		</React.Suspense>
	);
}
