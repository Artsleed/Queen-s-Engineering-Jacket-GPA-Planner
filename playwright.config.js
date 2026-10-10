import { defineConfig } from '@playwright/test';

// Browser smoke tests: `npm run test:e2e`. Starts the dev server automatically.
export default defineConfig({
  testDir: 'e2e',
  use: {
    baseURL: 'http://localhost:5179',
    viewport: { width: 1400, height: 900 },
    // Software WebGL so the 3D view works in headless Chromium.
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  webServer: {
    command: 'npx vite --port 5179 --strictPort',
    url: 'http://localhost:5179',
    reuseExistingServer: true,
  },
});
