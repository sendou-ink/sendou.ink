import { chatSearchParams } from "./chat-search-params";

export const chatOpenedPage = ({
	pageUrl,
	roomId,
}: {
	pageUrl: string;
	roomId: number;
}) => chatSearchParams.href(pageUrl, { chat: roomId });
