interface SseConnection {
	userId: number;
	setTopics: (topics: string[]) => void;
}

const connections = new Map<string, SseConnection>();

/** Registers a live SSE connection so its topic set can be addressed by connection id. */
export function register(connectionId: string, connection: SseConnection) {
	connections.set(connectionId, connection);
}

/** Removes a closed SSE connection from the registry. */
export function unregister(connectionId: string) {
	connections.delete(connectionId);
}

/** Replaces the connection's topic set wholesale. Returns false when the user has no live connection with the given id. */
export function replaceTopics(
	connectionId: string,
	userId: number,
	topics: string[],
): boolean {
	const connection = connections.get(connectionId);
	if (!connection || connection.userId !== userId) return false;

	connection.setTopics(topics);
	return true;
}
