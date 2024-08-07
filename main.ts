import * as slint from "npm:slint-ui@1.7.1";

interface Window {
  cpu_data: CPUData[];
  active_cpus: number;
  toggleCPU: (cpuNumber: number) => boolean;

  run: () => Promise<void>;
}

interface CPUData {
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

// Function to update active CPU count
function updateActiveCPUs(window: Window, cpuData: CPUData[]) {
  const activeCPUs = cpuData.filter((cpu) => cpu.active).length;
  window.active_cpus = activeCPUs;
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

  const workers: { [key: number]: Worker } = {};

  // Generate CPU data for the UI
  const cpuData = Array.from({ length: numCPUs }, (_, i) => ({
    number: i + 1,
    active: false,
  }));

  // Set the CPU data in the UI
  window.cpu_data = cpuData;

  // Initial update of active CPUs
  updateActiveCPUs(window, cpuData);

  // Connect UI signals to worker creation and termination
  window.toggleCPU = (cpuNumber: number) => {
    if (workers[cpuNumber]) {
      stopCPUWorker(workers, cpuNumber);
      cpuData[cpuNumber - 1].active = false;
    } else {
      startCPUWorker(workers, cpuNumber);
      cpuData[cpuNumber - 1].active = true;
    }
    updateActiveCPUs(window, cpuData);
    return cpuData[cpuNumber - 1].active;
  };

  await window.run();
  stopAllWorkers(workers);
}
