// Module-level handle on the active <video> so other panels can control playback.
let current: HTMLVideoElement | null = null;

export function registerVideo(el: HTMLVideoElement | null): void {
  current = el;
}

export function getVideo(): HTMLVideoElement | null {
  return current;
}
