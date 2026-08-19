import {
  AutoModelForVision2Seq,
  AutoProcessor,
  InterruptableStoppingCriteria,
  load_image,
  TextStreamer,
} from "@huggingface/transformers";

const MODEL_ID = "HuggingFaceTB/SmolVLM-256M-Instruct";
const MAX_NEW_TOKENS = 256;

let processorPromise: Promise<any> | null = null;
let modelPromise: Promise<any> | null = null;
const stoppingCriteria = new InterruptableStoppingCriteria();

function loadProcessor(progress_callback?: (event: unknown) => void) {
  processorPromise ??= AutoProcessor.from_pretrained(MODEL_ID, { progress_callback });
  return processorPromise;
}

function loadModel(progress_callback?: (event: unknown) => void) {
  modelPromise ??= AutoModelForVision2Seq.from_pretrained(MODEL_ID, {
    device: "webgpu",
    dtype: "fp32",
    progress_callback,
  });
  return modelPromise;
}

async function generate(image: string, prompt: string) {
  const progress = (event: unknown) => self.postMessage({ type: "progress", event });
  const [processor, model] = await Promise.all([loadProcessor(progress), loadModel(progress)]);
  const loadedImage = await load_image(image);
  const messages = [
    {
      role: "user",
      content: [
        { type: "image" },
        { type: "text", text: prompt || "Describe this image in detail." },
      ],
    },
  ];
  const text = processor.apply_chat_template(messages, { add_generation_prompt: true });
  const inputs = await processor(text, [loadedImage]);
  const streamer = new TextStreamer(processor.tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (output: string) => self.postMessage({ type: "token", output }),
  });

  stoppingCriteria.reset();
  const result = await model.generate({
    ...inputs,
    do_sample: false,
    repetition_penalty: 1.1,
    max_new_tokens: MAX_NEW_TOKENS,
    streamer,
    stopping_criteria: stoppingCriteria,
    return_dict_in_generate: true,
  });
  const decoded = processor.batch_decode(result.sequences, { skip_special_tokens: true });
  return decoded[0] || "I could not describe that image.";
}

self.addEventListener("message", async (event) => {
  const { type, image, prompt } = event.data || {};
  try {
    if (type === "check") {
      const adapter = await navigator.gpu?.requestAdapter();
      self.postMessage({ type: adapter ? "supported" : "unsupported" });
      return;
    }
    if (type === "generate") {
      self.postMessage({ type: "loading" });
      const output = await generate(image, prompt);
      self.postMessage({ type: "complete", output });
      return;
    }
    if (type === "interrupt") {
      stoppingCriteria.interrupt();
    }
  } catch (error) {
    self.postMessage({ type: "error", error: error instanceof Error ? error.message : String(error) });
  }
});
