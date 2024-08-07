# Burn Cpu

https://github.com/user-attachments/assets/0300b067-b68a-4085-b071-9d221f728e2f

## Usage

```
deno run --unstable-ffi --reload https://raw.githubusercontent.com/sigmaSd/burn-cpu-1/master/main.ts
```

On wayland (linux) slint use 100% of a cpu core. https://github.com/slint-ui/slint/issues/5780 https://github.com/slint-ui/slint/issues/4469 . So you should prefer running it on xwayland.
To force the program to run on xwayland you can run it like this:

```
WAYLAND_DISPLAY="" deno run --unstable-ffi --reload https://raw.githubusercontent.com/sigmaSd/burn-cpu-1/master/main.ts
```
