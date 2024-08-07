import * as slint from "npm:slint-ui@1.7.1";

// Import our Slint UI
const ui = slint.loadFile("./ui.slint");

const window = new ui.Window();

// Get the number of logical CPUs
const numCPUs = navigator.hardwareConcurrency || 4; // Fallback to 4 if not available

const workers: { [key: number]: Worker } = {};

// Function to start a CPU-intensive worker
function startCPUWorker(cpuNumber: number) {
  if (workers[cpuNumber]) {
    console.log(`CPU${cpuNumber} worker already running`);
    return;
  }
  const worker = new Worker(new URL("./cpu_worker.ts", import.meta.url).href, {
    type: "module",
  });
  worker.postMessage({ cpu: cpuNumber });
  workers[cpuNumber] = worker;
  console.log(`Started CPU${cpuNumber} worker`);
}

// Function to stop a CPU worker
function stopCPUWorker(cpuNumber: number) {
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
    stopCPUWorker(parseInt(cpuNumber));
  });
}

// Generate CPU data for the UI
const cpuData = Array.from({ length: numCPUs }, (_, i) => ({
  number: i + 1,
  active: false,
}));

// Set the CPU data in the UI
window.cpu_data = cpuData;

// Function to update active CPU count
function updateActiveCPUs() {
  const activeCPUs = cpuData.filter((cpu) => cpu.active).length;
  window.active_cpus = activeCPUs;
}

// Initial update of active CPUs
updateActiveCPUs();

// Connect UI signals to worker creation and termination
window.toggleCPU = (cpuNumber: number) => {
  if (workers[cpuNumber]) {
    stopCPUWorker(cpuNumber);
    cpuData[cpuNumber - 1].active = false;
  } else {
    startCPUWorker(cpuNumber);
    cpuData[cpuNumber - 1].active = true;
  }
  updateActiveCPUs();
  return cpuData[cpuNumber - 1].active;
};

await window.run();
stopAllWorkers(workers);
