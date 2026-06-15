import * as Sentry from "@sentry/react-router";
import { Config } from "~/config";
import { logger } from "../utils/logger";

const SENTRY_ENABLED = Config.sentry.enabled;

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
		const work = async () => {
			const startTime = performance.now();
			try {
				await this.func();
			} catch (error) {
				logger.error(`Error running routine ${this.name}: ${error}`);
				if (SENTRY_ENABLED) {
					Sentry.captureException(error);
				}
				return;
			}
			const endTime = performance.now();
			logger.info(`Routine ${this.name} completed in ${endTime - startTime}ms`);
		};

		if (SENTRY_ENABLED) {
			await Sentry.startSpan({ name: this.name, op: "cron" }, work);
		} else {
			await work();
		}
	}
}
