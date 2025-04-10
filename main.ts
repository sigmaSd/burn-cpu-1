import * as slint from "npm:slint-ui@1.10.0";

interface Window {
  cpu_data: CPUData[];
  gpu_data: GPUData[];
  active_cpus: number;
  active_gpus: number;
  toggleCPU: (cpuNumber: number) => boolean;
  toggleGPU: (gpuNumber: number, complexity: number) => boolean;

  run: () => Promise<void>;
}

interface CPUData {
  number: number;
  active: boolean;
}

interface GPUData {
  number: number;
  active: boolean;
}

function tmpDir(): string | null {
  switch (Deno.build.os) {
    case "linux": {
      return "/tmp";
    }
    case "darwin":
      return Deno.env.get("TMPDIR") ?? null;
    case "windows":
      return Deno.env.get("TMP") ?? Deno.env.get("TEMP") ?? null;
  }
  return null;
}

// Function to start a CPU-intensive worker
function startCPUWorker(
  workers: { [key: number]: Worker },
  cpuNumber: number,
) {
  if (workers[cpuNumber]) {
    return;
  }
  const worker = new Worker(
    import.meta.resolve("./cpu_worker.ts"),
    { type: "module" },
  );
  worker.postMessage({ cpu: cpuNumber });
  workers[cpuNumber] = worker;
}

// Function to stop a CPU worker
function stopCPUWorker(
  workers: { [key: number]: Worker },
  cpuNumber: number,
) {
  if (workers[cpuNumber]) {
    workers[cpuNumber].terminate();
    delete workers[cpuNumber];
  }
}

function stopAllCPUWorkers(workers: { [key: number]: Worker }) {
  Object.keys(workers).forEach((cpuNumber) => {
    stopCPUWorker(workers, parseInt(cpuNumber));
  });
}

// Function to start a GPU worker
function startGPUWorker(
  sdlWin: Window,
  gpuData: { number: number; active: boolean }[],
  gpuWorkers: { [key: number]: Worker },
  gpuNumber: number,
) {
  if (gpuWorkers[gpuNumber]) {
    return;
  }
  const worker = new Worker(
    import.meta.resolve("./gpu_worker.ts"),
    { type: "module" },
  );
  // Use low complexity to reduce performance impact
  worker.postMessage({ gpu: gpuNumber, complexity: 10 });
  worker.onmessage = (event) => {
    if (event.data.status === "finished") {
      gpuData[gpuNumber - 1].active = false;
      updateActiveGPUs(sdlWin, gpuData);
      sdlWin.gpu_data = gpuData;
      gpuWorkers[gpuNumber].terminate();
      delete gpuWorkers[gpuNumber];
    }
  };
  gpuWorkers[gpuNumber] = worker;
}

// Function to stop a GPU worker
function stopGPUWorker(
  gpuWorkers: { [key: number]: Worker },
  gpuNumber: number,
) {
  if (gpuWorkers[gpuNumber]) {
    gpuWorkers[gpuNumber].postMessage({ command: "stop" });
  }
}

function stopAllGPUWorkers(gpuWorkers: { [key: number]: Worker }) {
  Object.keys(gpuWorkers).forEach((gpuNumber) => {
    stopGPUWorker(gpuWorkers, parseInt(gpuNumber));
  });
}

// Function to update active CPU count
function updateActiveCPUs(window: Window, cpuData: CPUData[]) {
  const activeCPUs = cpuData.filter((cpu) => cpu.active).length;
  window.active_cpus = activeCPUs;
}

// Function to update active GPU count
function updateActiveGPUs(window: Window, gpuData: GPUData[]) {
  const activeGPUs = gpuData.filter((gpu) => gpu.active).length;
  window.active_gpus = activeGPUs;
}

if (import.meta.main) {
  // Copy fire SVG files to temp directory
  const cpuFirePath = (tmpDir() ?? "/tmp") + "/burncpu-fire-red.svg";
  const gpuFirePath = (tmpDir() ?? "/tmp") + "/burncpu-fire-green.svg";

  // Copy CPU fire
  await fetch(import.meta.resolve("./fire-red.svg"))
    .then((r) =>
      r.body?.pipeTo(
        Deno.openSync(cpuFirePath, {
          write: true,
          create: true,
        }).writable,
      )
    );

  // Copy GPU fire
  await fetch(import.meta.resolve("./fire-green.svg"))
    .then((r) =>
      r.body?.pipeTo(
        Deno.openSync(gpuFirePath, {
          write: true,
          create: true,
        }).writable,
      )
    );

  // Import our Slint UI and replace fire paths
  const uiData = await fetch(import.meta.resolve("./ui.slint"))
    .then((r) => r.text())
    .then((r) => r.replace("CPU_FIRE_PATH", cpuFirePath))
    .then((r) => r.replace("GPU_FIRE_PATH", gpuFirePath));

  const ui = slint.loadSource(uiData, "main.js");

  // deno-lint-ignore no-explicit-any
  const window = new (ui as any).Window() as Window;

  // Get the number of logical CPUs
  const numCPUs = navigator.hardwareConcurrency || 4; // Fallback to 4 if not available

  // Number of GPUs to display in the UI (typically 1 or 2 for most systems)
  const numGPUs = 1; // Default to 1 GPU

  const cpuWorkers: { [key: number]: Worker } = {};
  const gpuWorkers: { [key: number]: Worker } = {};

  // Generate CPU data for the UI
  const cpuData = Array.from({ length: numCPUs }, (_, i) => ({
    number: i + 1,
    active: false,
  }));

  // Generate GPU data for the UI
  const gpuData = Array.from({ length: numGPUs }, (_, i) => ({
    number: i + 1,
    active: false,
  }));

  // Set the CPU and GPU data in the UI
  window.cpu_data = cpuData;
  window.gpu_data = gpuData;

  // Initial update of active CPUs and GPUs
  updateActiveCPUs(window, cpuData);
  updateActiveGPUs(window, gpuData);

  // Connect UI signals to CPU worker creation and termination
  window.toggleCPU = (cpuNumber: number) => {
    if (cpuWorkers[cpuNumber]) {
      stopCPUWorker(cpuWorkers, cpuNumber);
      cpuData[cpuNumber - 1].active = false;
    } else {
      startCPUWorker(cpuWorkers, cpuNumber);
      cpuData[cpuNumber - 1].active = true;
    }
    updateActiveCPUs(window, cpuData);
    return cpuData[cpuNumber - 1].active;
  };

  // Connect UI signals to GPU worker creation and termination
  window.toggleGPU = (gpuNumber: number) => {
    if (gpuWorkers[gpuNumber]) {
      stopGPUWorker(gpuWorkers, gpuNumber);
      gpuData[gpuNumber - 1].active = false;
    } else {
      startGPUWorker(window, gpuData, gpuWorkers, gpuNumber);
      gpuData[gpuNumber - 1].active = true;
    }
    updateActiveGPUs(window, gpuData);
    return gpuData[gpuNumber - 1].active;
  };

  Deno.addSignalListener("SIGINT", () => {
    stopAllCPUWorkers(cpuWorkers);
    stopAllGPUWorkers(gpuWorkers);
    Deno.exit(0);
  });
  await window.run();
  stopAllCPUWorkers(cpuWorkers);
  stopAllGPUWorkers(gpuWorkers);
}
