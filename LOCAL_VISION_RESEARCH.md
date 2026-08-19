# Browser-local vision research

## Verified sources

- Transformers.js documentation: https://huggingface.co/docs/transformers.js/en/index
  - Runs Transformers models directly in the browser with no server.
  - Uses ONNX Runtime; `device: "webgpu"` enables browser GPU inference when supported.
  - WebGPU is experimental in some browsers; quantized models reduce bandwidth and memory.
- Transformers.js pipeline API: https://huggingface.co/docs/transformers.js/en/api/pipelines
  - Documents supported `image-to-text` and related browser pipelines.
- Official examples repository: https://github.com/huggingface/transformers.js-examples
  - Includes `smolvlm-webgpu`.
- Official SmolVLM example directory: https://github.com/huggingface/transformers.js-examples/tree/main/smolvlm-webgpu
  - README identifies `HuggingFaceTB/SmolVLM-256M-Instruct` as a 256M-parameter multimodal model optimized for in-browser inference.
- Official example worker source: https://raw.githubusercontent.com/huggingface/transformers.js-examples/main/smolvlm-webgpu/src/worker.js
  - Imports `AutoProcessor`, `AutoModelForVision2Seq`, `TextStreamer`, `InterruptableStoppingCriteria`, and `load_image` from `@huggingface/transformers`.
  - Loads model `HuggingFaceTB/SmolVLM-256M-Instruct` with `device: "webgpu"` and `dtype: "fp32"`.
  - Uses `processor.apply_chat_template`, `processor(text, images)`, and `model.generate` for image+text responses.

## Implementation decision

Use the official SmolVLM 256M WebGPU pattern in a client-only Web Worker. The model is downloaded into the browser on first use and runs locally; no API key or separate inference server is required. Keep hosted vision as a fallback for browsers without WebGPU, but expose a local mode/status so users understand the first-run download and device requirements.
