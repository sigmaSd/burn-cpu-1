import {
  EventType,
  PixelFormat,
  TextureAccess,
  WindowBuilder,
} from "jsr:@divy/sdl2";

const WIDTH = 1200;
const HEIGHT = 600;

// Flag to handle worker termination
let shouldRun = true;

// @ts-ignore - This is a worker
self.onmessage = (e: MessageEvent) => {
  // Handle termination message
  if (e.data.command === "stop") {
    shouldRun = false;
    return;
  }
  run(e);
};

async function run(e: MessageEvent) {
  const { gpu, complexity: _complexity = 50 } = e.data; // Rename to _complexity to indicate intentionally unused
  // Convert percentage to actual values
  const _complexityFactor = 0.01;

  using sdlWin = new WindowBuilder("GPU Stress Test", WIDTH, HEIGHT)
    .vulkan()
    .build();

  // Get the canvas from the window
  const canvas = sdlWin.canvas();

  // Create a texture creator for generating textures
  const textureCreator = canvas.textureCreator();

  // Pre-generate some random rectangles to improve performance
  const randomRects = [];
  for (let i = 0; i < 10000; i++) {
    randomRects.push([
      Math.floor(Math.random() * WIDTH), // x
      Math.floor(Math.random() * HEIGHT), // y
      Math.floor(Math.random() * 100), // w
      Math.floor(Math.random() * 100), // h
    ]);
  }

  // Create shader-based textures to better stress the GPU
  // Scale number of textures based on complexity
  const numTextures = 50;
  const textures = [];

  // Create multiple textures of varying sizes to stress GPU memory
  for (let i = 0; i < numTextures; i++) {
    const size = 256 * (i % 4 + 1); // Sizes: 256, 512, 768, 1024
    const texture = textureCreator.createTexture(
      PixelFormat.RGBA8888,
      TextureAccess.Target,
      size,
      size,
    );
    textures.push(texture);
  }

  // Create arrays for multi-drawing to reduce CPU overhead
  // Scale batch size based on complexity
  const batchSize = 20;
  // Scale number of batches based on complexity
  const numBatches = 1;
  const batchRects = [];

  // Generate batch rectangles for filling
  for (let i = 0; i < numBatches; i++) {
    const rects = [];
    for (let j = 0; j < batchSize; j++) {
      rects.push([
        Math.floor(Math.random() * WIDTH), // x
        Math.floor(Math.random() * HEIGHT), // y
        Math.floor(Math.random() * (WIDTH / 4)) + 50, // w - larger shapes
        Math.floor(Math.random() * (HEIGHT / 4)) + 50, // h - larger shapes
      ]);
    }
    batchRects.push(rects);
  }

  // Main event loop with rendering
  for await (const event of sdlWin.events(false)) {
    if (!shouldRun) break;
    if (event && event.type === EventType.Quit) {
      shouldRun = false;
      break;
    }

    // Render frame on each event
    // Clear screen
    canvas.setDrawColor(0, 0, 0, 255);
    canvas.clear();

    // Render to multiple textures first to stress GPU memory and bandwidth
    for (let t = 0; t < textures.length; t++) {
      // Draw batches of rectangles
      for (let b = 0; b < batchRects.length; b++) {
        // Use brighter, more intense colors to stress pixel processing
        canvas.setDrawColor(
          128 + Math.floor(Math.random() * 127), // Brighter colors
          128 + Math.floor(Math.random() * 127),
          128 + Math.floor(Math.random() * 127),
          255,
        );

        // Use the pre-generated batch
        const currentBatch = batchRects[b];

        // Draw each rectangle in the batch
        for (const [x, y, w, h] of currentBatch) {
          canvas.fillRect(x, y, w, h);
        }
      }
    }

    // Present the rendered content
    canvas.present();
    // Tick
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  self.postMessage({ status: "finished", id: gpu });
}
