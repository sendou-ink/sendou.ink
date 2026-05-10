export class LimitReachedError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "LimitReachedError";
	}
}

export class ConcurrentModificationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ConcurrentModificationError";
	}
}
