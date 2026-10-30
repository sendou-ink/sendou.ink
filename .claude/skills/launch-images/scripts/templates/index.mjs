import { changelogCard } from "./changelog-card.mjs";
import { timeline } from "./timeline.mjs";

/**
 * Every template by the name a config's `images[].template` uses. A template renders the inside
 * of its canvas (`html(data, ctx)`), styles it under its own name as class (`css`) and describes it
 * for the alt text (`altText(data)`). See ../../SKILL.md for when to use which.
 */
export const TEMPLATES = {
	"changelog-card": changelogCard,
	timeline,
};
