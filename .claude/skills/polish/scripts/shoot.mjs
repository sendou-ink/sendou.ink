/** biome-ignore-all lint/suspicious/noConsole: CLI script output */
// One page, looked at by hand: a screenshot, a before/after GIF or a slowed down recording of a
// few steps, optionally with the mechanical probes run at the end. The tool the reviewing agents
// drive, and the way to reproduce a finding.
//
//   node .claude/skills/polish/scripts/shoot.mjs <url> --out=<file.png> [options]
//
//   --as=<user id> | --anon     who is looking (default: the admin, 274)
//   --viewport=mobile|tablet|desktop|wide|<W>x<H>     (default desktop, 1440x900)
//   --theme=dark|light          (default dark)
//   --lang=<code>               the site's language (default English)
//   --read-only                 let no write out of the page: any button can be clicked (how the sweep's explore pass works)
//   --plain                     a page that is not the app (POLISH_BASE_URL): no login, no hydration marker
//   --full                      the whole page instead of the viewport
//   --tiles                     the whole page as viewport sized pictures (<out>-tile-1.png ...): a long page at full size
//   --mark=<selector>           outline the matching elements (repeatable)
//   --crop=<selector>           cut the picture to this element plus some surroundings
//   --do=<step>                 repeatable, run in order before the shot:
//        click:<selector>   hover:<selector>   focus:<selector>   press:<Key>   type:<text>
//        scroll:<y>   scrollto:<selector>   wait:<ms>   goto:<url>   theme:<dark|light>
//        viewport:<W>x<H>   shot  (an extra frame for --gif, taken at this point)
//   --gif                       the frames (start, every `shot`, end) looped as <out>.gif
//   --video[=<slowdown>]        record everything, saved slowed down (default 3x) as <out>.gif
//   --throttle                  slow network and CPU, to see what a load looks like
//   --probe[=overflow,contrast,...]   run mechanical probes at the end, print their findings
//   --inspect=<selector>        repeatable: print the numbers behind a claim about the matching elements (box, text
//                               box, font, padding, margin, gap, overflow), the first six of each
//   --shifts                    print the layout shifts recorded since the last load
//   --layout-diff               report what moved (and whether the page scrolled) because of the last click step
//
// Selectors are Playwright selectors: css, `text=Results`, `role=tab[name="Builds"]`. The first match is used.
import fs from "node:fs";
import path from "node:path";
import {
	ADMIN_ID,
	assertServerUp,
	launchBrowser,
	makeFlickerGif,
	openSession,
	parseArgs,
	setPlain,
	settle,
	shootMarked,
	videoToGif,
	visit,
} from "./lib.mjs";

const { flags, positionals } = parseArgs();
const url = positionals[0];
if (!url || !flags.out) {
	console.error(
		"Usage: shoot.mjs <url> --out=<file.png> [options], see the top of the file",
	);
	process.exit(1);
}

if (flags.plain) setPlain(true);
await assertServerUp();

const out = path.resolve(String(flags.out));
const stem = out.replace(/\.png$/, "");
fs.mkdirSync(path.dirname(out), { recursive: true });
const steps = [flags.do ?? []].flat().map(String);
const marks = [flags.mark ?? []].flat().map(String);
const viewportFlag = String(flags.viewport ?? "desktop");
const viewport = /^\d+x\d+$/.test(viewportFlag)
	? sizeOf(viewportFlag)
	: viewportFlag;
const videoDir = flags.video ? `${stem}-video-tmp` : undefined;

const browser = await launchBrowser();
const session = await openSession(browser, {
	viewer: flags.anon ? undefined : Number(flags.as ?? ADMIN_ID),
	viewport,
	theme: String(flags.theme ?? "dark"),
	videoDir,
	readOnly: Boolean(flags["read-only"]),
	lang: flags.lang ? String(flags.lang) : undefined,
});
const page = await session.newPage();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message.split("\n")[0]));

if (flags.throttle) {
	const cdp = await session.newCDPSession(page);
	await cdp.send("Network.enable");
	await cdp.send("Network.emulateNetworkConditions", {
		offline: false,
		latency: 40,
		downloadThroughput: (6 * 1024 * 1024) / 8,
		uploadThroughput: (1024 * 1024) / 8,
	});
	await cdp.send("Emulation.setCPUThrottlingRate", { rate: 2 });
}

const status = await visit(page, url);
console.log(`${status} ${page.url()}`);

const frames = [];
const frame = async (badge) => {
	const file = `${stem}-frame${frames.length + 1}.png`;
	await shootMarked(page, file, {
		marks: await markRects(),
		badge,
		crop: false,
	});
	frames.push(file);
};

if (flags.gif) await frame("1");

for (const step of steps) {
	const [verb, ...rest] = step.split(":");
	const argument = rest.join(":");
	switch (verb) {
		case "click": {
			const target = page.locator(argument).first();
			if (flags["layout-diff"]) {
				await target.scrollIntoViewIfNeeded();
				await target.evaluate((element) =>
					window.__polish.snapshotLayoutFor(element),
				);
				// by coordinates: a locator click scrolls the target into view again, which reads as a move
				const box = await target.boundingBox();
				await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
				await settle(page, { quiet: 350 });
				break;
			}
			await target.click();
			await settle(page, { quiet: 350 });
			break;
		}
		case "hover":
			await page.locator(argument).first().hover();
			await page.waitForTimeout(300);
			break;
		case "focus":
			await page.keyboard.press("Tab");
			await page.locator(argument).first().focus();
			await page.waitForTimeout(200);
			break;
		case "press":
			await page.keyboard.press(argument);
			await page.waitForTimeout(200);
			break;
		case "type":
			await page.keyboard.type(argument);
			await page.waitForTimeout(200);
			break;
		case "scroll":
			await page.evaluate((y) => window.scrollTo(0, y), Number(argument));
			await page.waitForTimeout(200);
			break;
		case "scrollto":
			await page
				.locator(argument)
				.first()
				.evaluate((element) =>
					element.scrollIntoView({ block: "center", behavior: "instant" }),
				);
			await page.waitForTimeout(200);
			break;
		case "wait":
			await page.waitForTimeout(Number(argument));
			break;
		case "goto":
			console.log(`${await visit(page, argument)} ${page.url()}`);
			break;
		case "theme":
			await page.emulateMedia({ colorScheme: argument });
			await page.waitForTimeout(250);
			break;
		case "viewport":
			await page.setViewportSize(sizeOf(argument));
			await page.waitForTimeout(300);
			break;
		case "shot":
			await frame(String(frames.length + 1));
			break;
		default:
			throw new Error(`Unknown step "${step}"`);
	}
}

if (flags["layout-diff"]) {
	const diff = await page
		.evaluate(() => window.__polish?.diffLayout?.() ?? null)
		.catch(() => null);
	console.log(`layout diff: ${JSON.stringify(diff, null, 2)}`);
}

if (flags.gif) {
	await frame(String(frames.length + 1));
	makeFlickerGif(frames, `${stem}.gif`);
	console.log(`${stem}.gif (${frames.length} frames)`);
}

if (flags.tiles) {
	const { height, total } = await page.evaluate(() => ({
		height: innerHeight,
		total: document.documentElement.scrollHeight,
	}));
	for (
		let top = 0, tile = 1;
		top < total && tile <= 40;
		top += height, tile++
	) {
		await page.evaluate((y) => scrollTo({ top: y, behavior: "instant" }), top);
		await page.waitForTimeout(250);
		await page.screenshot({
			path: `${stem}-tile-${tile}.png`,
			animations: "disabled",
		});
		console.log(`${stem}-tile-${tile}.png`);
	}
} else if (flags.full) {
	await page.screenshot({ path: out, fullPage: true, animations: "disabled" });
} else if (flags.crop) {
	const box = await page.locator(String(flags.crop)).first().boundingBox();
	await shootMarked(page, out, {
		marks: [
			...(await markRects()),
			...(box ? [{ rect: box, color: "transparent" }] : []),
		],
		pad: 60,
	});
} else {
	await shootMarked(page, out, { marks: await markRects(), crop: false });
}
console.log(out);

for (const selector of [flags.inspect ?? []].flat().map(String)) {
	const inspected = await page
		.locator(selector)
		.evaluateAll((elements) =>
			elements.slice(0, 6).map((element) => window.__polish.inspect(element)),
		);
	console.log(`inspect ${selector}: ${JSON.stringify(inspected, null, 2)}`);
}

if (flags.probe) {
	const probes =
		flags.probe === true
			? await page.evaluate(() => window.__polish.probeNames())
			: String(flags.probe).split(",");
	const found = await page.evaluate(
		(names) => window.__polish.run(names),
		probes,
	);
	console.log(
		JSON.stringify(
			found.map(({ rule, selector, text, detail }) => ({
				rule,
				selector,
				text,
				detail,
			})),
			null,
			2,
		),
	);
}

if (flags.shifts) {
	console.log(
		JSON.stringify(
			await page.evaluate(() => window.__polish.shifts()),
			null,
			2,
		),
	);
}

console.log(
	`scrollY=${await page.evaluate(() => Math.round(scrollY))} page=${await page.evaluate(() => `${document.documentElement.scrollWidth}x${document.documentElement.scrollHeight}`)} viewport=${await page.evaluate(() => `${document.documentElement.clientWidth}x${innerHeight}`)}`,
);
if (pageErrors.length > 0)
	console.log(`page errors: ${pageErrors.join(" | ")}`);

const video = page.video();
await session.close();
if (video) {
	const videoPath = await video.path();
	videoToGif(videoPath, `${stem}.gif`, {
		slowdown: flags.video === true ? 3 : Number(flags.video),
		width: Math.min(900, page.viewportSize()?.width ?? 900),
	});
	fs.rmSync(videoDir, { recursive: true, force: true });
	console.log(`${stem}.gif (recording)`);
}
await browser.close();

async function markRects() {
	const rects = [];
	for (const selector of marks) {
		for (const element of await page.locator(selector).all()) {
			const box = await element.boundingBox();
			if (box) rects.push({ rect: box });
		}
	}
	return rects;
}

function sizeOf(text) {
	const [width, height] = text.split("x").map(Number);
	return { width, height };
}
