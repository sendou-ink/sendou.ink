export class LimitReachedError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "LimitReachedError";
	}
}
