"use client";

let worker: Worker | null = null;
let supportedPromise: Promise<boolean> | null = null;

function getWorker() {
  worker ??= new Worker(new URL("./local-vision.worker.ts", import.meta.url), { type: "module" });
  return worker;
}

export function localVisionSupported() {
  supportedPromise ??= new Promise<boolean>((resolve) => {
    const instance = getWorker();
    const handle = (event: MessageEvent) => {
      if (event.data?.type === "supported") {
        instance.removeEventListener("message", handle);
        resolve(true);
      } else if (event.data?.type === "unsupported") {
        instance.removeEventListener("message", handle);
        resolve(false);
      }
    };
    instance.addEventListener("message", handle);
    instance.postMessage({ type: "check" });
  });
  return supportedPromise;
}

export function runLocalVision(
  image: string,
  prompt: string,
  onProgress?: (message: string) => void,
) {
  return new Promise<string>((resolve, reject) => {
    const instance = getWorker();
    let output = "";
    const handle = (event: MessageEvent) => {
      const data = event.data || {};
      if (data.type === "progress") {
        const status = data.event?.status || data.event?.file || "Downloading local vision model…";
        onProgress?.(String(status));
      } else if (data.type === "loading") {
        onProgress?.("Loading local vision model…");
      } else if (data.type === "token") {
        output += data.output || "";
      } else if (data.type === "complete") {
        instance.removeEventListener("message", handle);
        resolve(data.output || output);
      } else if (data.type === "error") {
        instance.removeEventListener("message", handle);
        reject(new Error(data.error || "Local vision failed"));
      }
    };
    instance.addEventListener("message", handle);
    instance.postMessage({ type: "generate", image, prompt });
  });
}
