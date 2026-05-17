import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import pdfParse from "pdf-parse";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const projectId = formData.get("projectId") as string;

    if (!file || !projectId) {
      return Response.json({ error: "Missing file or projectId" }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const pdf = await pdfParse(Buffer.from(buffer));
    const text = pdf.text;

    // Get embeddings from HuggingFace
    const hfApiKey = process.env.HF_API_KEY;
    const embeddingResponse = await fetch(
      "https://api-inference.huggingface.co/pipeline/feature-extraction",
      {
        headers: { Authorization: `Bearer ${hfApiKey}` },
        method: "POST",
        body: JSON.stringify({ inputs: text.slice(0, 512) }),
      }
    );

    const embedding = await embeddingResponse.json();

    // Store in Supabase
    const { data, error } = await supabase
      .from("rag_documents")
      .insert({
        project_id: projectId,
        filename: file.name,
        content: text,
        embedding: embedding[0],
        created_at: new Date(),
      });

    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ success: true, documentId: data?.[0]?.id });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
