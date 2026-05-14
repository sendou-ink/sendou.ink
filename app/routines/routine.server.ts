import * as Sentry from "@sentry/react-router";
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
		await Sentry.startSpan(
			{
				name: this.name,
				op: "cron",
			},
			async () => {
				const startTime = performance.now();
				try {
					await this.func();
				} catch (error) {
					logger.error(`Error running routine ${this.name}: ${error}`);
					Sentry.captureException(error);
					return;
				}
				const endTime = performance.now();
				logger.info(
					`Routine ${this.name} completed in ${endTime - startTime}ms`,
				);
			},
		);
	}
}
