/** biome-ignore-all lint/suspicious/noConsole: CLI script output */
// One component as it looks on several pages, side by side in one picture: the way to see whether
// it is the same everywhere (heights, paddings, sizes, how it copes with each page's content).
//
//   node .claude/skills/polish/scripts/montage.mjs --selector=<selector> --out=<file.png> <url> [<url>...]
//        [--module=app/components/Foo.module.css]   instead of URLs: the pages the last sweeps saw that module on
//        [--viewport=mobile|tablet|desktop|wide|<W>x<H>] [--theme=light] [--as=<user id>|--anon] [--lang=<code>]
//        [--each=3]   how many matches per page (default 1)
//
// Selectors are Playwright selectors. A class of a CSS module is matched by its name:
// `[class*="_ownerLink_"]`.
import fs from "node:fs";
import path from "node:path";
import {
	ADMIN_ID,
	assertServerUp,
	launchBrowser,
	openSession,
	parseArgs,
	readOutputJson,
	visit,
} from "./lib.mjs";

const { flags, positionals } = parseArgs();
const modulePages = flags.module
	? (readOutputJson("modules.json")?.[String(flags.module)] ?? [])
	: [];
const urls = [...positionals, ...modulePages].slice(0, 16);
if (!flags.selector || !flags.out || urls.length === 0) {
	console.error(
		"Usage: montage.mjs --selector=<selector> --out=<file.png> <url> [<url>...] | --module=<css module file>",
	);
	process.exit(1);
}

await assertServerUp();
const out = path.resolve(String(flags.out));
fs.mkdirSync(path.dirname(out), { recursive: true });
const viewportFlag = String(flags.viewport ?? "desktop");
const viewport = /^\d+x\d+$/.test(viewportFlag)
	? {
			width: Number(viewportFlag.split("x")[0]),
			height: Number(viewportFlag.split("x")[1]),
		}
	: viewportFlag;
const each = Number(flags.each ?? 1);

const browser = await launchBrowser();
const session = await openSession(browser, {
	viewer: flags.anon ? undefined : Number(flags.as ?? ADMIN_ID),
	viewport,
	theme: String(flags.theme ?? "dark"),
	lang: flags.lang ? String(flags.lang) : undefined,
});
const page = await session.newPage();

const crops = [];
for (const url of urls) {
	const status = await visit(page, url).catch(() => 0);
	const matches = await page.locator(String(flags.selector)).all();
	if (status >= 400 || matches.length === 0) {
		console.log(`${url}: ${status >= 400 ? `answers ${status}` : "no match"}`);
		continue;
	}
	for (const match of matches.slice(0, each)) {
		await match.scrollIntoViewIfNeeded().catch(() => {});
		const box = await match.boundingBox();
		if (!box || box.width < 1 || box.height < 1) continue;
		const pad = 12;
		const shot = await page.screenshot({
			clip: {
				x: Math.max(0, box.x - pad),
				y: Math.max(0, box.y - pad),
				width: box.width + pad * 2,
				height: box.height + pad * 2,
			},
			animations: "disabled",
		});
		crops.push({
			url,
			size: `${Math.round(box.width)}x${Math.round(box.height)}`,
			image: shot.toString("base64"),
		});
	}
}

if (crops.length === 0) {
	console.error("Nothing matched on any page.");
	await browser.close();
	process.exit(1);
}

const sheet = await session.newPage();
await sheet.setContent(`<!doctype html><body style="margin:0;padding:16px;background:#1b1b1f;color:#ddd;font:13px/1.4 system-ui,sans-serif;display:flex;flex-direction:column;gap:14px;width:max-content">
${crops
	.map(
		(crop) =>
			`<figure style="margin:0"><figcaption style="margin-bottom:4px">${escapeHtml(crop.url)} <span style="opacity:.6">${crop.size}px</span></figcaption><img src="data:image/png;base64,${crop.image}" style="display:block;border:1px solid #444"></figure>`,
	)
	.join("\n")}
</body>`);
await sheet.locator("body").screenshot({ path: out });
console.log(`${out} (${crops.length} crops)`);
for (const crop of crops) console.log(`  ${crop.size}px  ${crop.url}`);
await browser.close();

function escapeHtml(text) {
	return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
}
