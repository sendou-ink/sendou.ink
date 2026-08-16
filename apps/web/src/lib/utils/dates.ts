export function databaseTimestampToDate(timestamp: number) {
	return new Date(databaseTimestampToJavascriptTimestamp(timestamp));
}

export function databaseTimestampToJavascriptTimestamp(timestamp: number) {
	return timestamp * 1000;
}

export function dateToDatabaseTimestamp(date: Date) {
	return Math.floor(date.getTime() / 1000);
}

export function databaseTimestampNow() {
	return dateToDatabaseTimestamp(new Date());
}
