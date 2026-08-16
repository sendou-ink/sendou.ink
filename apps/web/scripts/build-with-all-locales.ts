import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WEB_DIR = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const SETTINGS_PATH = path.join(WEB_DIR, "project.inlang/settings.json");
const LOCALES_DIR = path.resolve(WEB_DIR, "../web-react/locales");

const allLocales = fs
	.readdirSync(LOCALES_DIR)
	.filter((item) => fs.statSync(path.join(LOCALES_DIR, item)).isDirectory())
	.sort();

console.log(`Building with locales: ${allLocales.join(", ")}`);

const backupPath = `${SETTINGS_PATH}.backup`;
fs.writeFileSync(backupPath, fs.readFileSync(SETTINGS_PATH, "utf8"));

try {
	const buildSettings = {
		...JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8")),
		locales: allLocales,
	};
	fs.writeFileSync(
		SETTINGS_PATH,
		`${JSON.stringify(buildSettings, null, "\t")}\n`,
		"utf8",
	);

	execSync("pnpm run build", { stdio: "inherit", cwd: WEB_DIR });
} finally {
	fs.writeFileSync(SETTINGS_PATH, fs.readFileSync(backupPath, "utf8"));
	fs.unlinkSync(backupPath);
}
