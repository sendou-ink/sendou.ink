#!/usr/bin/env node

import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { join, parse, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SVG_SOURCE_DIR = join(__dirname, '..', 'src/lib/components/icons/svg');
const SVELTE_OUTPUT_DIR = join(__dirname, '..', 'src/lib/components/icons');

const SVELTE_TEMPLATE = `<!--
	This file is auto-generated. Do not modify directly.
	Generated from SVG file by convert-icons script.
-->
<script lang="ts">
	import type { SvelteHTMLElements } from 'svelte/elements';

	let props: SvelteHTMLElements['svg'] = $props();
</script>

{SVG_CONTENT}`;

function toKebabCase(str: string): string {
	return str
		.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2')
		.toLowerCase();
}

/**
 * Processes SVG content to make it compatible with Svelte and optimizes it
 */
function processSvgContent(svgContent: string): string {
	// Remove XML declaration if present
	svgContent = svgContent.replace(/<\?xml[^>]*\?>\s*/, '');
	
	// Remove common unnecessary attributes and elements
	svgContent = svgContent
		// Remove version attribute
		.replace(/\s*version="[^"]*"/g, '')
		// Remove id attributes (can cause conflicts in components)
		.replace(/\s*id="[^"]*"/g, '')
		// Remove class attributes (use CSS classes on the component instead)
		.replace(/\s*class="[^"]*"/g, '')
		// Remove style attributes (use CSS or props instead)
		.replace(/\s*style="[^"]*"/g, '')
		// Remove data-* attributes
		.replace(/\s*data-[^=]*="[^"]*"/g, '')
		// Remove title and desc elements (accessibility should be handled at component level)
		.replace(/<title[^>]*>.*?<\/title>\s*/gs, '')
		.replace(/<desc[^>]*>.*?<\/desc>\s*/gs, '')
		// Remove defs if empty or only contains unused elements
		.replace(/<defs>\s*<\/defs>\s*/g, '')
		// Remove comments
		.replace(/<!--.*?-->\s*/gs, '')
		// Clean up multiple spaces
		.replace(/\s+/g, ' ')
		// Clean up space before closing tags
		.replace(/\s*\/>/g, ' />');
	
	// Add {...props} to the svg tag if not already present
	if (!svgContent.includes('{...props}')) {
		svgContent = svgContent.replace(
			/<svg([^>]*)>/,
			(_match, attributes) => {
				return `<svg${attributes} {...props}>`;
			}
		);
	}
	
	const lines = svgContent.split('\n');
	const indentedLines = lines.map((line, index) => {
		if (index === 0 || line.trim() === '') return line;
		return '\t' + line;
	});
	
	return indentedLines.join('\n');
}

/**
 * Reads an SVG file and converts it to a Svelte component
 */
async function convertSvgToSvelte(svgPath: string, outputPath: string): Promise<void> {
	try {
		const svgContent = await readFile(svgPath, 'utf-8');
		const processedSvg = processSvgContent(svgContent);
		const svelteContent = SVELTE_TEMPLATE.replace('{SVG_CONTENT}', processedSvg);
		
		await writeFile(outputPath, svelteContent, 'utf-8');
		console.log(`✅ Converted: ${parse(svgPath).name} → ${parse(outputPath).name}`);
	} catch (error) {
		console.error(`❌ Error converting ${svgPath}:`, error);
	}
}

/**
 * Main function to process all SVG files
 */
async function main(): Promise<void> {
	try {
		// Ensure output directory exists
		await mkdir(SVELTE_OUTPUT_DIR, { recursive: true });
		
		// Read all files from the SVG directory
		const files = await readdir(SVG_SOURCE_DIR);
		const svgFiles = files.filter(file => file.toLowerCase().endsWith('.svg'));
		
		if (svgFiles.length === 0) {
			console.log('No SVG files found in the source directory.');
			return;
		}
		
		console.log(`Found ${svgFiles.length} SVG file(s) to convert...\n`);
		
		// Process each SVG file
		const conversions = svgFiles.map(async (svgFile) => {
			const svgPath = join(SVG_SOURCE_DIR, svgFile);
			const { name } = parse(svgFile);
			
			// Keep filename in kebab-case for Svelte component
			const svelteFileName = `${toKebabCase(name)}.svelte`;
			const outputPath = join(SVELTE_OUTPUT_DIR, svelteFileName);
			
			await convertSvgToSvelte(svgPath, outputPath);
		});
		
		await Promise.all(conversions);
		
		console.log(`\n🎉 Successfully converted ${svgFiles.length} SVG file(s) to Svelte components!`);
		console.log(`📁 Output directory: ${SVELTE_OUTPUT_DIR}`);
		
	} catch (error) {
		console.error('❌ Error during conversion:', error);
		process.exit(1);
	}
}

main().catch(error => {
	console.error('❌ Error during conversion:', error);
	process.exit(1);
});
