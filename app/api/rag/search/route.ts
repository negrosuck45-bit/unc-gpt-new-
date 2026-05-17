import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { query, projectId } = await req.json();

    const hfApiKey = process.env.HF_API_KEY;
    const embeddingResponse = await fetch(
      "https://api-inference.huggingface.co/pipeline/feature-extraction",
      {
        headers: { Authorization: `Bearer ${hfApiKey}` },
        method: "POST",
        body: JSON.stringify({ inputs: query }),
      }
    );

    const embedding = await embeddingResponse.json();

    const { data, error } = await supabase.rpc("search_rag", {
      query_embedding: embedding[0],
      project_id: projectId,
      match_threshold: 0.5,
      match_count: 5,
    });

    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ results: data });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
