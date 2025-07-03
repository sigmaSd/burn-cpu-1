/// <reference lib="webworker" />
self.onmessage = (e: MessageEvent) => {
  const _cpuNumber = e.data.cpu; // Prefix with underscore to indicate intentionally unused

  // Infinite loop to max out CPU
  while (true) {
    // Keep the CPU busy
  }
};
