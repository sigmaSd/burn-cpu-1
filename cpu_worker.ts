self.onmessage = (e: MessageEvent) => {
  const cpuNumber = e.data.cpu;
  console.log(`CPU${cpuNumber} worker started`);

  // Infinite loop to max out CPU
  while (true) {
  }
};
