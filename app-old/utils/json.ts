export function safeJSONParse<T>(json: string, defaultValue: T): T {
	try {
		return JSON.parse(json);
	} catch (e) {
		return defaultValue;
	}
}
