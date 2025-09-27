import { describe, it, expect } from 'vitest';
import { removeMarkdown } from './strings';

describe('removeMarkdown', () => {
	it('removes HTML tags', () => {
		expect(removeMarkdown('<p>Hello <strong>world</strong></p>')).toBe('Hello world');
		expect(removeMarkdown('<div><span>test</span></div>')).toBe('test');
	});

	it('removes markdown headers', () => {
		expect(removeMarkdown('# Header 1')).toBe('Header 1');
		expect(removeMarkdown('## Header 2')).toBe('Header 2');
		expect(removeMarkdown('### Header 3')).toBe('Header 3');
	});

	it('removes images', () => {
		expect(removeMarkdown('![alt text](image.jpg)')).toBe('');
		expect(removeMarkdown('![alt text][image-ref]')).toBe('');
		expect(removeMarkdown('Text ![alt](img.png) more text')).toBe('Text  more text');
	});

	it('removes inline links', () => {
		expect(removeMarkdown('[Link text](http://example.com)')).toBe('Link text');
		expect(removeMarkdown('[Link text][ref]')).toBe('Link text');
		expect(removeMarkdown('Check out [this link](http://example.com) for more info')).toBe(
			'Check out this link for more info'
		);
	});

	it('removes blockquotes', () => {
		expect(removeMarkdown('> This is a quote')).toBe('This is a quote');
		expect(removeMarkdown('  > Indented quote')).toBe('Indented quote');
	});

	it('removes emphasis with asterisks', () => {
		expect(removeMarkdown('*italic text*')).toBe('italic text');
		expect(removeMarkdown('**bold text**')).toBe('bold text');
		expect(removeMarkdown('***bold italic***')).toBe('bold italic');
	});

	it('removes emphasis with underscores', () => {
		expect(removeMarkdown('_italic text_')).toBe('italic text');
		expect(removeMarkdown('__bold text__')).toBe('bold text');
		expect(removeMarkdown('Text _with emphasis_ here')).toBe('Text with emphasis here');
	});

	it('removes strikethrough', () => {
		expect(removeMarkdown('~strikethrough text~')).toBe('strikethrough text');
		expect(removeMarkdown('Text with ~strikethrough~ here')).toBe('Text with strikethrough here');
	});

	it('handles complex markdown with multiple elements', () => {
		const markdown = `# Header
		
**Bold text** and *italic text* with [a link](http://example.com).

> This is a blockquote with \`inline code\`.

![Image](image.jpg)

\`\`\`
code block
\`\`\`

~Strikethrough~ text.`;

		const result = removeMarkdown(markdown);

		expect(result).not.toContain('#');
		expect(result).not.toContain('**');
		expect(result).not.toContain('*');
		expect(result).not.toContain('[');
		expect(result).not.toContain(']');
		expect(result).not.toContain('(');
		expect(result).not.toContain(')');
		expect(result).not.toContain('>');
		expect(result).not.toContain('`');
		expect(result).not.toContain('~');
	});

	it('returns empty string for empty input', () => {
		expect(removeMarkdown('')).toBe('');
	});

	it('returns unchanged text with no markdown', () => {
		const plainText = 'This is just plain text without any markdown.';
		expect(removeMarkdown(plainText)).toBe(plainText);
	});

	it('turns multiple newlines into two newlines', () => {
		const text = 'Line 1\n\n\n\nLine 2';
		expect(removeMarkdown(text)).toBe('Line 1\n\nLine 2');
	});

	it('handles html tag', () => {
		const text = '<div>Hello\n<strong>World</strong></div>';
		expect(removeMarkdown(text)).toBe('Hello\nWorld');
	});

	it('handles html tag with an attribute', () => {
		const text = '<span style="color:orange">1st Place</span>';
		expect(removeMarkdown(text)).toBe('1st Place');
	});
});
