export class ConcurrentModificationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ConcurrentModificationError";
	}
}

export class DuplicateEntryError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "DuplicateEntryError";
	}
}
