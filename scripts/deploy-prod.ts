import { spawnSync } from "node:child_process";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const RENDER_API_URL = "https://api.render.com/v1";

const POLL_INTERVAL_MS = 10_000;
const DEPLOY_TIMEOUT_MS = 30 * 60_000;
const HEALTH_TIMEOUT_MS = 10 * 60_000;

/** The previous version is still serving when a deploy fails at one of these stages. */
const FAILED_BEFORE_SWAP_STATUSES = [
	"build_failed",
	"pre_deploy_failed",
	"canceled",
];
const FINISHED_STATUSES = [
	"live",
	"update_failed",
	"deactivated",
	...FAILED_BEFORE_SWAP_STATUSES,
];

/** Public traffic gets Render's 503 page during maintenance, so the instance is asked directly over SSH. */
const HEALTH_CHECK_SCRIPT = `node -e 'fetch("http://localhost:" + (process.env.PORT || 10000) + "/health").then((r) => console.log(r.status), () => console.log(0))'`;

interface RenderConfig {
	apiKey: string;
	serviceId: string;
	sshTarget: string;
}

async function main() {
	loadEnv();
	const config = readConfig();

	const maintenancePageUri = await fetchMaintenancePageUri(config);
	const previousReleaseCommit = await fetchLiveCommit(config);

	log("Enabling maintenance mode");
	await setMaintenanceMode(config, { enabled: true, uri: maintenancePageUri });

	log("Triggering deploy");
	const deployId = await triggerDeploy(config);

	const status = await waitForDeployToFinish(config, deployId);
	if (status !== "live") {
		if (FAILED_BEFORE_SWAP_STATUSES.includes(status)) {
			await setMaintenanceMode(config, {
				enabled: false,
				uri: maintenancePageUri,
			});
			throw new Error(
				`Deploy ended with "${status}", the previous version is still running. Maintenance mode disabled.`,
			);
		}

		throw new Error(
			`Deploy ended with "${status}". Maintenance mode left on, check the Render dashboard.`,
		);
	}

	await waitForHealthy(config.sshTarget);

	log("Disabling maintenance mode");
	await setMaintenanceMode(config, { enabled: false, uri: maintenancePageUri });

	log("Deploy done");

	if (previousReleaseCommit) {
		log(
			`\nChangelog image (dev server running): pnpm run changelog:image ${previousReleaseCommit}`,
		);
	}
}

function loadEnv() {
	try {
		process.loadEnvFile(path.join(REPO_ROOT, ".env"));
	} catch {
		// .env is optional, the values can also come from the environment
	}
}

function readConfig(): RenderConfig {
	const apiKey = process.env.RENDER_API_KEY;
	const serviceId = process.env.RENDER_SERVICE_ID;
	const sshTarget = process.env.PROD_SSH_TARGET;

	if (!apiKey || !serviceId || !sshTarget) {
		throw new Error(
			"RENDER_API_KEY, RENDER_SERVICE_ID and PROD_SSH_TARGET must be set in .env",
		);
	}

	return { apiKey, serviceId, sshTarget };
}

async function fetchMaintenancePageUri(config: RenderConfig) {
	const service = await renderApi(config, `/services/${config.serviceId}`);

	return (service.serviceDetails?.maintenanceMode?.uri as string) ?? "";
}

async function fetchLiveCommit(config: RenderConfig) {
	try {
		const deploys: Array<{
			deploy: { status: string; commit?: { id: string } };
		}> = await renderApi(
			config,
			`/services/${config.serviceId}/deploys?limit=20`,
		);

		return deploys.find(({ deploy }) => deploy.status === "live")?.deploy.commit
			?.id;
	} catch (error) {
		log(`Could not fetch the currently live commit: ${error}`);
		return undefined;
	}
}

async function setMaintenanceMode(
	config: RenderConfig,
	maintenanceMode: { enabled: boolean; uri: string },
) {
	await renderApi(config, `/services/${config.serviceId}`, {
		method: "PATCH",
		body: { serviceDetails: { maintenanceMode } },
	});
}

async function triggerDeploy(config: RenderConfig) {
	const deploy = await renderApi(
		config,
		`/services/${config.serviceId}/deploys`,
		{
			method: "POST",
			body: {},
		},
	);

	if (!deploy?.id) {
		throw new Error(
			"Render queued the deploy behind another one. Maintenance mode left on, check the Render dashboard.",
		);
	}

	return deploy.id as string;
}

async function waitForDeployToFinish(config: RenderConfig, deployId: string) {
	const startedAt = Date.now();
	let lastStatus: string | null = null;

	while (Date.now() - startedAt < DEPLOY_TIMEOUT_MS) {
		try {
			const deploy = await renderApi(
				config,
				`/services/${config.serviceId}/deploys/${deployId}`,
			);
			const status = deploy.status as string;

			if (status !== lastStatus) {
				log(`Deploy status: ${status} (${elapsed(startedAt)})`);
				lastStatus = status;
			}

			if (FINISHED_STATUSES.includes(status)) return status;
		} catch (error) {
			log(`Polling deploy status failed: ${error}`);
		}

		await sleep(POLL_INTERVAL_MS);
	}

	throw new Error(
		"Timed out waiting for the deploy to finish. Maintenance mode left on, check the Render dashboard.",
	);
}

async function waitForHealthy(sshTarget: string) {
	const startedAt = Date.now();

	while (Date.now() - startedAt < HEALTH_TIMEOUT_MS) {
		const result = spawnSync(
			"ssh",
			[
				"-o",
				"BatchMode=yes",
				"-o",
				"ConnectTimeout=10",
				sshTarget,
				HEALTH_CHECK_SCRIPT,
			],
			{ encoding: "utf8" },
		);
		const statusCode = result.stdout?.trim();
		const failureReason = result.stderr?.trim();

		log(
			`/health responded with ${statusCode || "nothing"} (${elapsed(startedAt)})${!statusCode && failureReason ? `: ${failureReason}` : ""}`,
		);
		if (statusCode === "200") return;

		await sleep(POLL_INTERVAL_MS);
	}

	throw new Error(
		"Timed out waiting for /health to return 200. Maintenance mode left on, check the Render dashboard.",
	);
}

async function renderApi(
	config: RenderConfig,
	apiPath: string,
	{ method = "GET", body }: { method?: string; body?: unknown } = {},
) {
	const response = await fetch(`${RENDER_API_URL}${apiPath}`, {
		method,
		headers: {
			Authorization: `Bearer ${config.apiKey}`,
			Accept: "application/json",
			"Content-Type": "application/json",
		},
		body: body ? JSON.stringify(body) : undefined,
	});

	const text = await response.text();
	if (!response.ok) {
		throw new Error(
			`Render API ${method} ${apiPath} failed with ${response.status}: ${text}`,
		);
	}

	return text ? JSON.parse(text) : null;
}

function elapsed(startedAt: number) {
	return `${Math.round((Date.now() - startedAt) / 1000)}s`;
}

function log(message: string) {
	// biome-ignore lint/suspicious/noConsole: CLI script output
	console.log(message);
}

main().catch((error) => {
	// biome-ignore lint/suspicious/noConsole: CLI script output
	console.error((error as Error).message);
	process.exit(1);
});
