import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA_DIR = path.resolve(process.cwd(), '.gemini-browser-profile');
const OUTPUT_FILE = path.resolve(process.cwd(), 'argon-plan.md');

function getExecutablePath() {
  if (fs.existsSync(CHROME_PATH)) return CHROME_PATH;
  if (fs.existsSync(EDGE_PATH)) return EDGE_PATH;
  throw new Error('Neither Google Chrome nor Microsoft Edge was found at standard locations.');
}

function copyToSystemClipboard(text) {
  try {
    const proc = spawnSync('clip', { input: text, encoding: 'utf-8' });
    return proc.status === 0;
  } catch (e) {
    console.warn('Could not copy to system clipboard:', e);
    return false;
  }
}

function getPrompt() {
  const args = process.argv.slice(2);
  const fileArgIndex = args.findIndex(a => a === '--file' || a === '-f');
  if (fileArgIndex !== -1 && args[fileArgIndex + 1]) {
    const filePath = path.resolve(process.cwd(), args[fileArgIndex + 1]);
    if (fs.existsSync(filePath)) {
      console.log(`Loading prompt from file: ${filePath}`);
      return fs.readFileSync(filePath, 'utf-8');
    }
  }

  const defaultPromptFile = path.resolve(process.cwd(), 'scripts', 'argon-prompt.txt');
  if (args.length === 0 && fs.existsSync(defaultPromptFile)) {
    console.log(`Loading default prompt from: scripts/argon-prompt.txt`);
    return fs.readFileSync(defaultPromptFile, 'utf-8');
  }

  if (args.length === 0) {
    console.log('Usage: npm.cmd run argon "<your prompt or task>" or npm.cmd run argon -- --file <path>');
    console.log('Using default architecture prompt...\n');
    return 'Review current 3D Print Manager architecture and propose key next improvements.';
  }
  return args.join(' ');
}

const PROJECT_CONTEXT = `[Project Context:
- Project: Centurai Print OS / 3D Print Manager
- Hardware: Elegoo Centauri Carbon (CC1), 0.4mm nozzle, textured PEI bed.
- Location: University Student Dormitory (quiet hours, gyroid infill, controlled acceleration, air quality: strictly PLA/PETG, safe bed adhesion).
- Tech Stack: React 19, Three.js / @react-three/fiber, Vite, Supabase.
- Rule: Never use emojis.]

`;

async function main() {
  const userPrompt = getPrompt();
  const fullPrompt = PROJECT_CONTEXT + userPrompt;

  console.log('====================================================');
  console.log('          Argon 4 Browser Bridge (Pro Plan)        ');
  console.log('====================================================');
  console.log(`Prompt length: ${fullPrompt.length} characters`);
  console.log('Copying prompt to clipboard...');
  copyToSystemClipboard(fullPrompt);

  console.log('Launching browser session...');

  const browser = await puppeteer.launch({
    executablePath: getExecutablePath(),
    userDataDir: USER_DATA_DIR,
    headless: false,
    defaultViewport: null,
    ignoreDefaultArgs: ['--enable-automation'],
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--start-maximized',
    ],
  });

  try {
    const pages = await browser.pages();
    const page = pages.length > 0 ? pages[0] : await browser.newPage();

    // Prevent detection
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    console.log('Navigating to Gemini Web (https://gemini.google.com/app)...');
    await page.goto('https://gemini.google.com/app', { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Wait for chat input. If not logged in, prompt user.
    const inputSelector = 'div[contenteditable="true"], rich-textarea p, .ql-editor';
    let inputElement = null;

    console.log('Checking login session...');
    try {
      inputElement = await page.waitForSelector(inputSelector, { timeout: 10000 });
    } catch {
      console.log('\n>>> ACTION REQUIRED: Please sign in with your Google Account in the open browser.');
      console.log('>>> Once logged in, the script will automatically continue.\n');
      inputElement = await page.waitForSelector(inputSelector, { timeout: 300000 }); // 5 minutes for first login
    }

    console.log('Session confirmed. Inserting prompt...');
    await new Promise(r => setTimeout(r, 2000));

    // Focus input and paste via Ctrl+V or event
    await inputElement.click();
    await new Promise(r => setTimeout(r, 500));

    await page.keyboard.down('Control');
    await page.keyboard.press('KeyV');
    await page.keyboard.up('Control');

    await new Promise(r => setTimeout(r, 1000));

    // Double check if text is inside, fallback if not
    const hasText = await page.evaluate(() => {
      const el = document.querySelector('div[contenteditable="true"]') ||
                 document.querySelector('rich-textarea p') ||
                 document.querySelector('.ql-editor');
      return el && el.textContent.trim().length > 10;
    });

    if (!hasText) {
      console.log('Clipboard paste fallback: inserting text via execCommand...');
      await page.evaluate((text) => {
        const el = document.querySelector('div[contenteditable="true"]') ||
                   document.querySelector('rich-textarea p') ||
                   document.querySelector('.ql-editor');
        if (el) {
          el.focus();
          document.execCommand('insertText', false, text);
        }
      }, fullPrompt);
    }

    await new Promise(r => setTimeout(r, 1500));

    // Submit prompt
    console.log('Submitting prompt to Gemini...');
    const sendButtonSelector = 'button[aria-label*="Send"], button.send-button, mat-icon[fonticon="send"]';
    try {
      const sendButton = await page.$(sendButtonSelector);
      if (sendButton) {
        await sendButton.click();
      } else {
        await page.keyboard.press('Enter');
      }
    } catch {
      await page.keyboard.press('Enter');
    }

    console.log('Waiting for Gemini 4 Argon to generate the response...');
    await new Promise(r => setTimeout(r, 4000));

    // Wait for the stop button to appear and then disappear (indicates completion)
    const stopSelector = 'button[aria-label*="Stop"], button[mattooltip*="Stop"]';
    try {
      await page.waitForSelector(stopSelector, { timeout: 20000 });
      console.log('Streaming response in progress...');
      await page.waitForSelector(stopSelector, { hidden: true, timeout: 600000 }); // up to 10 mins for large response
    } catch {
      console.log('Monitoring response stream stability...');
      let lastLength = 0;
      let stableCount = 0;
      for (let i = 0; i < 90; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const length = await page.evaluate(() => {
          const responses = document.querySelectorAll('.model-response-text, message-content, [data-test-id="model-response-text"]');
          const last = responses[responses.length - 1];
          return last ? (last.innerText || '').length : 0;
        });
        if (length > 100 && length === lastLength) {
          stableCount++;
          if (stableCount >= 3) break;
        } else {
          stableCount = 0;
          lastLength = length;
        }
      }
    }

    await new Promise(r => setTimeout(r, 3000));

    // Extract the latest response
    const responseText = await page.evaluate(() => {
      const responses = document.querySelectorAll('.model-response-text, message-content, [data-test-id="model-response-text"]');
      if (responses.length > 0) {
        const last = responses[responses.length - 1];
        return last.innerText || last.textContent;
      }
      return null;
    });

    if (!responseText) {
      console.error('Failed to extract response content from page.');
      return;
    }

    const outputContent = `# Argon 4 Generated Plan
Generated: ${new Date().toISOString()}

## User Prompt Summary
${userPrompt.slice(0, 500)}...

## Argon 4 Architecture & Implementation Plan
${responseText}
`;

    fs.writeFileSync(OUTPUT_FILE, outputContent, 'utf-8');
    console.log('\n====================================================');
    console.log(`Success! Argon plan written to: ${path.basename(OUTPUT_FILE)}`);
    console.log('Switch back to Antigravity, and ask to implement the plan.');
    console.log('====================================================\n');
  } catch (err) {
    console.error('Error during execution:', err);
  }
}

main();
