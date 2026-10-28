/** biome-ignore-all lint/suspicious/noConsole: CLI script output */

// `publish` uploads the screenshots of a `pnpm run docs:capture` run to the docs' Space (CI, on pushes to main),
// `download` fetches the published ones whose spec is unchanged since its capture into the docs site (its build on Render),
// see docs/site/src/content/docs/dev/living-docs.mdx

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { S3 } from "@aws-sdk/client-s3";
import { ROOT } from "./ast.ts";
import { screenshotName } from "./links.ts";
import { SCREENSHOTS_DIR } from "./visits.ts";

const BUCKET = "sendou-docs";
const SPACES_ENDPOINT = "https://nyc3.digitaloceanspaces.com";
const PUBLIC_URL = `https://${BUCKET}.nyc3.digitaloceanspaces.com`;
const PREFIX = "screenshots";
const MANIFEST_KEY = `${PREFIX}/manifest.json`;
const E2E_DIR = "e2e";
const DOWNLOAD_CONCURRENCY = 16;

/**
 * Screenshot directory of a spec (e.g. `scrims`) → the content hash of the spec its screenshots were captured from and their files.
 * A screenshot is named after the spec line it is of, so it only fits the spec as it was.
 */
type Manifest = Record<string, { specHash: string; files: string[] }>;

async function main() {
	const command = process.argv[2];

	if (command === "publish") return publish();
	if (command === "download") return download();

	throw new Error(
		`Unknown command "${command}", expected "publish" or "download"`,
	);
}

async function publish() {
	const s3 = spacesClient();
	const previous = await readManifest(s3);
	const specHashes = currentSpecHashes();
	const manifest: Manifest = {};
	const superseded: string[] = [];
	let uploaded = 0;

	for (const [dir, specHash] of specHashes) {
		const entry = previous[dir];
		const files = capturedFiles(dir);
		if (files.length === 0) {
			if (entry) manifest[dir] = entry;
			continue;
		}

		await Promise.all(
			files.map((file) =>
				s3.putObject({
					Bucket: BUCKET,
					Key: `${capturePrefix(dir, specHash)}/${file}`,
					Body: fs.readFileSync(path.join(ROOT, SCREENSHOTS_DIR, dir, file)),
					ContentType: "image/jpeg",
					ACL: "public-read",
				}),
			),
		);
		uploaded += files.length;

		if (entry?.specHash === specHash) {
			manifest[dir] = {
				specHash,
				files: [...new Set([...entry.files, ...files])].sort(),
			};
		} else {
			manifest[dir] = { specHash, files };
			if (entry) superseded.push(capturePrefix(dir, entry.specHash));
		}
	}

	for (const [dir, entry] of Object.entries(previous)) {
		if (!specHashes.has(dir)) {
			superseded.push(capturePrefix(dir, entry.specHash));
		}
	}

	await s3.putObject({
		Bucket: BUCKET,
		Key: MANIFEST_KEY,
		Body: `${JSON.stringify(manifest, null, "\t")}\n`,
		ContentType: "application/json",
		CacheControl: "no-cache",
		ACL: "public-read",
	});

	for (const prefix of superseded) await deletePrefix(s3, prefix);

	console.log(
		`Published ${uploaded} screenshots, removed ${superseded.length} outdated captures`,
	);
}

/** Never fails, the docs site builds without screenshots. */
async function download() {
	try {
		const response = await fetch(`${PUBLIC_URL}/${MANIFEST_KEY}`);
		if (!response.ok) {
			throw new Error(`manifest responded with ${response.status}`);
		}
		const manifest: Manifest = await response.json();
		const specHashes = currentSpecHashes();

		const queue: Array<{ dir: string; specHash: string; file: string }> = [];
		let changedSpecs = 0;
		for (const [dir, entry] of Object.entries(manifest)) {
			if (specHashes.get(dir) !== entry.specHash) {
				changedSpecs++;
				continue;
			}

			const localDir = path.join(ROOT, SCREENSHOTS_DIR, dir);
			fs.rmSync(localDir, { recursive: true, force: true });
			fs.mkdirSync(localDir, { recursive: true });
			for (const file of entry.files) {
				queue.push({ dir, specHash: entry.specHash, file });
			}
		}

		let downloaded = 0;
		let failed = 0;
		await Promise.all(
			Array.from({ length: DOWNLOAD_CONCURRENCY }, async () => {
				while (queue.length > 0) {
					const { dir, specHash, file } = queue.pop()!;
					const image = await fetch(
						`${PUBLIC_URL}/${capturePrefix(dir, specHash)}/${file}`,
					);
					if (!image.ok) {
						failed++;
						continue;
					}

					fs.writeFileSync(
						path.join(ROOT, SCREENSHOTS_DIR, dir, file),
						Buffer.from(await image.arrayBuffer()),
					);
					downloaded++;
				}
			}),
		);

		console.log(
			`Downloaded ${downloaded} screenshots${failed > 0 ? `, ${failed} failed` : ""}. ${changedSpecs} specs changed since their capture and have none`,
		);
	} catch (error) {
		console.warn(`Could not download the screenshots: ${error}`);
	}
}

function spacesClient() {
	const accessKeyId = process.env.SPACES_ACCESS_KEY;
	const secretAccessKey = process.env.SPACES_SECRET_KEY;
	if (!accessKeyId || !secretAccessKey) {
		throw new Error("SPACES_ACCESS_KEY and SPACES_SECRET_KEY must be set");
	}

	return new S3({
		endpoint: SPACES_ENDPOINT,
		region: "us-east-1",
		credentials: { accessKeyId, secretAccessKey },
		requestChecksumCalculation: "WHEN_REQUIRED",
		responseChecksumValidation: "WHEN_REQUIRED",
	});
}

async function readManifest(s3: S3): Promise<Manifest> {
	try {
		const object = await s3.getObject({ Bucket: BUCKET, Key: MANIFEST_KEY });

		return JSON.parse((await object.Body?.transformToString()) ?? "{}");
	} catch (error) {
		if ((error as Error).name === "NoSuchKey") return {};
		throw error;
	}
}

async function deletePrefix(s3: S3, prefix: string) {
	let continuationToken: string | undefined;

	do {
		const listing = await s3.listObjectsV2({
			Bucket: BUCKET,
			Prefix: `${prefix}/`,
			ContinuationToken: continuationToken,
		});
		await Promise.all(
			(listing.Contents ?? []).map((object) =>
				s3.deleteObject({ Bucket: BUCKET, Key: object.Key }),
			),
		);
		continuationToken = listing.NextContinuationToken;
	} while (continuationToken);
}

/** Screenshot directory → the content hash of the spec as it is now. */
function currentSpecHashes() {
	return new Map(
		fs
			.readdirSync(path.join(ROOT, E2E_DIR))
			.filter((file) => file.endsWith(".spec.ts"))
			.map((file) => {
				const spec = `${E2E_DIR}/${file}`;
				const hash = createHash("sha256")
					.update(fs.readFileSync(path.join(ROOT, spec)))
					.digest("hex")
					.slice(0, 16);

				return [path.dirname(screenshotName(spec, 1)), hash];
			}),
	);
}

function capturedFiles(dir: string) {
	const localDir = path.join(ROOT, SCREENSHOTS_DIR, dir);
	if (!fs.existsSync(localDir)) return [];

	return fs
		.readdirSync(localDir)
		.filter((file) => file.endsWith(".jpg"))
		.sort();
}

function capturePrefix(dir: string, specHash: string) {
	return `${PREFIX}/${dir}/${specHash}`;
}

main().catch((error) => {
	console.error((error as Error).message);
	process.exit(1);
});
