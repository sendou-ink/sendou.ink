import { logger } from "../utils/logger";

export class Routine {
	private name;
	private func;

	constructor({
		name,
		func,
	}: {
		name: string;
		func: () => Promise<void>;
	}) {
		this.name = name;
		this.func = func;
	}

	async run() {
		logger.info(`Running routine: ${this.name}`);
		const startTime = performance.now();
		try {
			await this.func();
		} catch (error) {
			logger.error(`Error running routine ${this.name}: ${error}`);
			return;
		}
		const endTime = performance.now();
		logger.info(`Routine ${this.name} completed in ${endTime - startTime}ms`);
	}
}
