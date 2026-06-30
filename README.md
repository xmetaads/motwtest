# Service Worker Synthetic Streamed Download Testbed

This repository contains a test environment for Service Worker-based synthetic and streamed downloads of executable files (`.exe`) with on-the-fly Gzip compression using browser-native `CompressionStream`.

## Files

- `index.html`: The frontend user interface with a modern glassmorphism dashboard, controls for download options, and a live Event Log monitor.
- `sw.js`: The Service Worker that intercepts `/download-synthetic` requests, generates a binary stream, injects DOS/PE headers to mock an executable, and pipes the stream through Gzip compression.

## How to Test

1. Deploy this repository to Vercel (HTTPS is automatically provided).
2. Open the deployed website in your browser.
3. Verify that the Service Worker registers successfully and changes its status badge to **Active**.
4. Configure your download (e.g., file size, data entropy type, and whether to use Gzip).
5. Click **Generate & Start Download**.
6. Observe the progress in the **Real-time Event Stream** log panel.
