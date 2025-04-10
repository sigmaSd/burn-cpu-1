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
    console.log(`CPU${cpuNumber} worker already running`);
    return;
  }
  const worker = new Worker(
    import.meta.resolve("./cpu_worker.ts"),
    { type: "module" },
  );
  worker.postMessage({ cpu: cpuNumber });
  workers[cpuNumber] = worker;
  console.log(`Started CPU${cpuNumber} worker`);
}

// Function to stop a CPU worker
function stopCPUWorker(
  workers: { [key: number]: Worker },
  cpuNumber: number,
) {
  if (workers[cpuNumber]) {
    workers[cpuNumber].terminate();
    delete workers[cpuNumber];
    console.log(`Stopped CPU${cpuNumber} worker`);
  } else {
    console.log(`No active worker for CPU${cpuNumber}`);
  }
}

function stopAllWorkers(workers: { [key: number]: Worker }) {
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
  complexity: number = 100,
) {
  if (gpuWorkers[gpuNumber]) {
    console.log(`GPU${gpuNumber} worker already running`);
    return;
  }
  const worker = new Worker(
    import.meta.resolve("./gpu_worker.ts"),
    { type: "module" },
  );
  worker.postMessage({ gpu: gpuNumber, complexity: complexity });
  worker.onmessage = (event) => {
    if (event.data.status === "finished") {
      gpuData[gpuNumber - 1].active = false;
      updateActiveGPUs(sdlWin, gpuData);
      sdlWin.gpu_data = gpuData;
      console.log(gpuData, gpuNumber, gpuWorkers);
      gpuWorkers[gpuNumber].terminate();
      delete gpuWorkers[gpuNumber];
      console.log(`Stopped GPU${gpuNumber} worker`);
    }
  };
  gpuWorkers[gpuNumber] = worker;
  console.log(`Started GPU${gpuNumber} worker with complexity ${complexity}%`);
}

// Function to stop a GPU worker
function stopGPUWorker(
  gpuWorkers: { [key: number]: Worker },
  gpuNumber: number,
) {
  if (gpuWorkers[gpuNumber]) {
    gpuWorkers[gpuNumber].postMessage({ command: "stop" });
    console.log(`Stopping GPU${gpuNumber} worker`);
  } else {
    console.log(`No active worker for GPU${gpuNumber}`);
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
  // TODO: embed the svg so I don't need this hack
  const imageUrlPath = (tmpDir() ?? "/tmp") + "/burncpu-fire.svg";
  await fetch(import.meta.resolve("./fire.svg"))
    .then((r) =>
      r.body?.pipeTo(
        Deno.openSync(imageUrlPath, {
          write: true,
          create: true,
        }).writable,
      )
    );

  // Import our Slint UI
  // TODO: same hack part 2
  const uiData = await fetch(import.meta.resolve("./ui.slint"))
    .then((r) => r.text())
    .then((r) => r.replace("IMAGE_URL_PATH", imageUrlPath));

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
  window.toggleGPU = (gpuNumber: number, complexity: number) => {
    if (gpuWorkers[gpuNumber]) {
      stopGPUWorker(gpuWorkers, gpuNumber);
      gpuData[gpuNumber - 1].active = false;
    } else {
      startGPUWorker(window, gpuData, gpuWorkers, gpuNumber, complexity);
      gpuData[gpuNumber - 1].active = true;
    }
    updateActiveGPUs(window, gpuData);
    return gpuData[gpuNumber - 1].active;
  };

  await window.run();
  stopAllWorkers(cpuWorkers);
  stopAllGPUWorkers(gpuWorkers);
}
