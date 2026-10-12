import { defineConfig } from '@playwright/test';

// Browser smoke tests: `npm run test:e2e`. Starts the dev server automatically.
export default defineConfig({
  testDir: 'e2e',
  // Software WebGL (SwiftShader) spends several seconds per page load compiling shaders and
  // drawing the 3D jacket on the CPU, and some tests load the page twice. Real GPUs are far faster.
  timeout: 60000,
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
