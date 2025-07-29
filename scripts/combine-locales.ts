import fs from 'fs';
import path from 'path';

const LOCALES_DIR = 'locales';
const OUTPUT_DIR = 'messages';

function convertVariableSyntax(text: string) {
  if (typeof text !== 'string') return text;
  return text.replace(/\{\{([^}]+)\}\}/g, '{$1}');
}

function flattenObject(obj: Record<string, any>, prefix = '') {
  const flattened = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const formatKey = key.replaceAll('.', '_').replaceAll('-', '_');
    const formatPrefix = prefix ? prefix.replaceAll('.', '_').replaceAll('-', '_') : prefix;
    const newKey = formatPrefix ? `${formatPrefix}_${formatKey}` : formatKey;

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(flattened, flattenObject(value, newKey));
    } else {
      flattened[newKey] = convertVariableSyntax(value);
    }
  }
  
  return flattened;
}

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const locales = fs.readdirSync(LOCALES_DIR).filter(item => {
  return fs.statSync(path.join(LOCALES_DIR, item)).isDirectory();
});

console.log(`\nCreating ${locales.length} language files from /${LOCALES_DIR} to /${OUTPUT_DIR}...`);

for (const locale of locales) {
  const localeDir = path.join(LOCALES_DIR, locale);
  const jsonFiles = fs.readdirSync(localeDir).filter(file => file.endsWith('.json'));

  const combinedMessages = {
    "$schema": "https://inlang.com/schema/inlang-message-format"
  };
  
  for (const file of jsonFiles) {
    const filePath = path.join(localeDir, file);
    const fileName = path.basename(file, '.json');
    
      const content = fs.readFileSync(filePath, 'utf8');
      const jsonContent = JSON.parse(content);
      
      const flattenedContent = flattenObject(jsonContent, fileName);
      
      Object.assign(combinedMessages, flattenedContent);
  }
  
  const outputPath = path.join(OUTPUT_DIR, `${locale}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(combinedMessages, null, 2), 'utf8');
  
  console.log(`✓ Created ${outputPath}`);
}

console.log('Done creating language files!');