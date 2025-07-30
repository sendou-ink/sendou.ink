import * as fs from 'fs/promises';
import * as path from 'path';

interface TranslationObject {
  [key: string]: string | TranslationObject;
}

async function loadJson(filePath: string): Promise<TranslationObject> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`Error loading ${filePath}:`, error);
    throw error;
  }
}

async function saveJson(filePath: string, data: TranslationObject): Promise<void> {
  try {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  } catch (error) {
    console.error(`Error saving ${filePath}:`, error);
    throw error;
  }
}

function cleanTranslations(
  translations: TranslationObject,
  englishTranslations: TranslationObject,
  currentPath = ''
): TranslationObject {
  const cleaned: TranslationObject = {};

  for (const [key, value] of Object.entries(translations)) {
    const fullPath = currentPath ? `${currentPath}.${key}` : key;
    const englishValue = englishTranslations[key];

    // Always preserve $schema key
    if (key === '$schema') {
      cleaned[key] = value;
      continue;
    }

    if (typeof value === 'string') {
      // Skip empty strings
      if (value === '') {
        console.log(`Removed empty key: ${fullPath}`);
        continue;
      }

      // Skip if same as English
      if (typeof englishValue === 'string' && value === englishValue) {
        console.log(`Removed duplicate of English: ${fullPath}`);
        continue;
      }

      cleaned[key] = value;
    } else if (typeof value === 'object' && value !== null) {
      // Handle nested objects
      const englishNested = typeof englishValue === 'object' && englishValue !== null 
        ? englishValue 
        : {};
      
      const cleanedNested = cleanTranslations(value, englishNested, fullPath);
      
      // Only include nested object if it has content
      if (Object.keys(cleanedNested).length > 0) {
        cleaned[key] = cleanedNested;
      } else {
        console.log(`Removed empty nested object: ${fullPath}`);
      }
    }
  }

  return cleaned;
}

async function processTranslationFiles(messagesDir: string): Promise<void> {
  try {
    // Load English translations as reference
    const englishPath = path.join(messagesDir, 'en.json');
    const englishTranslations = await loadJson(englishPath);

    // Get all JSON files in the directory
    const files = await fs.readdir(messagesDir);
    const jsonFiles = files.filter(file => 
      file.endsWith('.json') && file !== 'en.json'
    );

    console.log(`Found ${jsonFiles.length} translation files to process`);

    for (const file of jsonFiles) {
      const filePath = path.join(messagesDir, file);
      const locale = path.basename(file, '.json');
      
      console.log(`\nProcessing ${locale}...`);
      
      const translations = await loadJson(filePath);
      const cleaned = cleanTranslations(translations, englishTranslations);
      
      // Save the cleaned translations
      await saveJson(filePath, cleaned);
      
      const originalKeys = Object.keys(translations).length;
      const cleanedKeys = Object.keys(cleaned).length;
      console.log(`${locale}: ${originalKeys - cleanedKeys} keys removed, ${cleanedKeys} keys remaining`);
    }

    console.log('\n✅ All translation files processed successfully!');
  } catch (error) {
    console.error('Error processing translation files:', error);
    process.exit(1);
  }
}

// Main execution
const messagesDir = process.argv[2] || './messages';

console.log(`Cleaning translation files in: ${messagesDir}`);
processTranslationFiles(messagesDir);
