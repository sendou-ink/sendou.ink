import fs from 'fs';
import { execSync } from 'child_process';

const SETTINGS_PATH = './project.inlang/settings.json';
const ALL_LOCALES = [
  "da",
  "de", 
  "en",
  "es-ES",
  "es-US",
  "fr-CA",
  "fr-EU", 
  "he",
  "it",
  "ja",
  "ko",
  "nl",
  "pl",
  "pt-BR",
  "ru",
  "zh"
];

function run() {
  console.log(`Building with languages: ${ALL_LOCALES.join(', ')}`);

  const backupPath = `${SETTINGS_PATH}.backup`;

  fs.writeFileSync(backupPath, fs.readFileSync(SETTINGS_PATH, 'utf8'));
  
  try {
    const buildSettings = {
      ...JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')),
      locales: ALL_LOCALES
    };

    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(buildSettings, null, '\t') + '\n', 'utf8');

    execSync('npx tsx scripts/combine-locales.ts', { stdio: 'inherit' });

    console.log('\nStarting build process...');
    execSync('npm run build', { stdio: 'inherit' });
  } catch (error) {
    console.error('Build failed:', error);
  } finally {
    fs.writeFileSync(SETTINGS_PATH, fs.readFileSync(backupPath, 'utf8'));
    fs.unlinkSync(backupPath);
  }
}

run();
