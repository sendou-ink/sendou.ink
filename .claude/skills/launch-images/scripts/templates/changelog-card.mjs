import { boldMarkdown, stripBold } from "./shared.mjs";

/** The changelog entry as a 1200x675 card: nav icon in the OG ring, NEW pill, title, headline, bullets. */
export const changelogCard = {
	html({ kicker = "NEW", title, headline, bullets = [] }, { iconSrc }) {
		return `
		<div class="iconArea">
			<div class="ring"></div>
			<img class="icon" src="${iconSrc}" alt="">
		</div>
		<div class="text">
			<div class="kicker"><span class="new">${kicker}</span><span class="wordmark">sendou.ink</span></div>
			<h1>${title}</h1>
			<div class="headline">${headline}</div>
			<ul>${bullets.map((bullet) => `<li>${boldMarkdown(bullet)}</li>`).join("")}</ul>
		</div>
		<div class="blob" style="right:70px;top:46px;width:60px;height:54px;background:var(--second)"></div>
		<div class="blob" style="right:160px;top:84px;width:34px;height:30px;background:var(--accent)"></div>
		<div class="blob" style="left:60px;bottom:52px;width:44px;height:40px;background:var(--accent)"></div>`;
	},
	altText({ title, headline, bullets = [] }) {
		return [
			`New on sendou.ink: ${title}. ${headline}.`,
			...bullets.map((bullet) => `- ${stripBold(bullet)}`),
		].join("\n");
	},
	css: `
.changelog-card { width: 1200px; height: 675px; display: flex; align-items: center; }
.changelog-card .iconArea { position: relative; flex: none; width: 420px; height: 100%; }
.changelog-card .ring { position: absolute; left: 50px; top: 50%; translate: 0 -50%; width: 330px; height: 330px;
	border: 6px dashed color-mix(in oklab, var(--accent) 60%, transparent); border-radius: 50%; rotate: 12deg; }
.changelog-card .icon { position: absolute; left: 85px; top: 50%; translate: 0 -50%; width: 260px; rotate: -8deg;
	filter: drop-shadow(16px 22px 0 color-mix(in oklab, var(--accent) 55%, transparent)); }
.changelog-card .text { padding-right: 70px; display: flex; flex-direction: column; }
.changelog-card .kicker { display: flex; align-items: center; gap: 14px; }
.changelog-card .new { font-size: 18px; font-weight: var(--weight-extra); letter-spacing: 0.14em; color: #000;
	background: var(--second); padding: 4px 12px 3px; border-radius: 999px; }
.changelog-card h1 { margin: 4px 0 0; font-size: 84px; font-weight: var(--weight-extra); letter-spacing: -0.02em; line-height: 1; }
.changelog-card .headline { margin-top: 12px; font-size: 27px; font-weight: var(--weight-bold); line-height: 1.25; text-wrap: balance; }
.changelog-card ul { margin: 22px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 10px; }
.changelog-card li { position: relative; padding-left: 30px; font-size: 20px; line-height: 1.32; color: var(--text-soft); text-wrap: pretty; }
.changelog-card li::before { content: ""; position: absolute; left: 0; top: 7px; width: 15px; height: 13px;
	border-radius: 58% 42% 55% 45% / 48% 60% 40% 52%; background: var(--accent); }
.changelog-card li:nth-child(even)::before { background: var(--second); }
`,
};
