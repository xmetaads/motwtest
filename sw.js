// sw.js - Service Worker for Synthetic Streamed Download with Gzip
const CACHE_NAME = 'sw-synthetic-cache-v1';
const LOG_CHANNEL_NAME = 'sw-download-logs';

let logChannel;
try {
  logChannel = new BroadcastChannel(LOG_CHANNEL_NAME);
} catch (e) {
  console.warn('BroadcastChannel not supported in this browser context:', e);
}

// Helper to send log messages to the UI client
function logToClient(level, message, data = {}) {
  console.log(`[SW] [${level.toUpperCase()}] ${message}`, data);
  if (logChannel) {
    logChannel.postMessage({
      source: 'service-worker',
      level,
      message,
      data,
      timestamp: Date.now()
    });
  }
}

self.addEventListener('install', (event) => {
  logToClient('info', 'Service Worker installing...');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  logToClient('info', 'Service Worker activated and controlling clients.');
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Intercept the specific download path
  if (url.pathname === '/download-synthetic') {
    logToClient('info', `Intercepted download request: ${url.search}`);
    event.respondWith(handleSyntheticDownload(url));
  }
});

/**
 * Handles generating and streaming the synthetic executable file.
 * @param {URL} url 
 * @returns {Response}
 */
function handleSyntheticDownload(url) {
  const filename = url.searchParams.get('filename') || 'synthetic-app.exe';
  const size = parseInt(url.searchParams.get('size'), 10) || 10 * 1024 * 1024; // Default 10MB
  const gzip = url.searchParams.get('gzip') === 'true';
  const generatorType = url.searchParams.get('generator') || 'compressible';

  logToClient('info', `Starting stream: ${filename} (${(size / 1024 / 1024).toFixed(2)} MB), gzip=${gzip}, type=${generatorType}`);

  let bytesWritten = 0;
  const chunkSize = 64 * 1024; // 64KB chunks for smooth streaming and progress updates

  // Pre-generate a compressible pattern chunk (repeated words)
  const textEncoder = new TextEncoder();
  const patternString = "ThisIsSyntheticDataGeneratedByTheServiceWorkerForStreamingAndGzipTesting-";
  const compressiblePattern = textEncoder.encode(patternString.repeat(Math.ceil(chunkSize / patternString.length)));

  // Simple minimal DOS + PE Executable header template (68 bytes)
  // Starts with 'MZ' (0x4D, 0x5A), has e_lfanew pointing to 0x40, and 'PE\0\0' (0x50, 0x45, 0x00, 0x00) at 0x40
  const exeHeader = new Uint8Array(68);
  exeHeader[0] = 0x4D; // 'M'
  exeHeader[1] = 0x5A; // 'Z'
  // DOS header details...
  exeHeader[2] = 0x90; 
  exeHeader[3] = 0x00;
  exeHeader[4] = 0x03;
  exeHeader[8] = 0x04;
  exeHeader[14] = 0x00;
  exeHeader[16] = 0xB0;
  exeHeader[24] = 0x40; // e_lfanew offset pointer (usually 0x40)
  // PE signature at offset 0x40 (64)
  exeHeader[64] = 0x50; // 'P'
  exeHeader[65] = 0x45; // 'E'
  exeHeader[66] = 0x00;
  exeHeader[67] = 0x00;

  const stream = new ReadableStream({
    start(controller) {
      logToClient('status', 'Stream readable start', { filename, totalSize: size });
    },
    pull(controller) {
      if (bytesWritten >= size) {
        logToClient('status', 'Stream execution completed', { bytesWritten });
        controller.close();
        return;
      }

      const remaining = size - bytesWritten;
      const currentChunkSize = Math.min(chunkSize, remaining);
      let chunk = new Uint8Array(currentChunkSize);

      if (bytesWritten === 0) {
        // First chunk: inject the MZ/PE header to make it look like a valid Windows binary
        logToClient('info', 'Injecting MZ/PE executable header signature...');
        const headerLen = Math.min(exeHeader.length, currentChunkSize);
        chunk.set(exeHeader.subarray(0, headerLen), 0);

        // Fill the rest of the first chunk
        for (let i = headerLen; i < currentChunkSize; i++) {
          if (generatorType === 'compressible') {
            chunk[i] = compressiblePattern[i % compressiblePattern.length];
          } else {
            chunk[i] = Math.floor(Math.random() * 256);
          }
        }
      } else {
        // Subsequent chunks
        if (generatorType === 'compressible') {
          // Fast copy from pre-generated pattern
          chunk.set(compressiblePattern.subarray(0, currentChunkSize), 0);
        } else {
          // Fill with random bytes
          for (let i = 0; i < currentChunkSize; i++) {
            chunk[i] = Math.floor(Math.random() * 256);
          }
        }
      }

      controller.enqueue(chunk);
      bytesWritten += chunk.byteLength;

      // Broadcast progress every ~512KB to avoid spamming BroadcastChannel too heavily
      if (bytesWritten >= size || Math.floor((bytesWritten - chunk.byteLength) / (512 * 1024)) !== Math.floor(bytesWritten / (512 * 1024))) {
        logToClient('progress', `Generated ${(bytesWritten / 1024 / 1024).toFixed(2)} MB of ${(size / 1024 / 1024).toFixed(2)} MB`, {
          bytesWritten,
          totalSize: size,
          percent: Math.min(100, (bytesWritten / size * 100).toFixed(1))
        });
      }
    },
    cancel(reason) {
      logToClient('warn', `Download stream cancelled by browser: ${reason}`);
    }
  });

  // Prepare headers for the download
  const headers = new Headers({
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });

  let outputStream = stream;

  if (gzip) {
    if (typeof CompressionStream !== 'undefined') {
      logToClient('info', 'Piping stream through CompressionStream (gzip)...');
      outputStream = stream.pipeThrough(new CompressionStream('gzip'));
      headers.set('Content-Type', 'application/x-gzip');
    } else {
      logToClient('error', 'CompressionStream is NOT supported in this browser environment!');
      headers.set('Content-Type', 'application/octet-stream');
      headers.set('X-Compression-Error', 'CompressionStream not supported');
    }
  } else {
    // Serving raw binary executable
    headers.set('Content-Type', 'application/x-msdownload');
  }

  return new Response(outputStream, {
    status: 200,
    headers: headers
  });
}
