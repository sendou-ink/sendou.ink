import markdownit from 'markdown-it';
import { removeHtmlTags } from './strings';

const md = markdownit();

export function renderMarkdown(value: string) {
	return md.render(removeHtmlTags(value));
}
