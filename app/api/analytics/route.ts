import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const period = searchParams.get("period") || "7d";

    if (!userId) {
      return Response.json({ error: "Missing userId" }, { status: 400 });
    }

    // Get analytics data from Supabase
    const { data: events, error } = await supabase
      .from("analytics")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1000);

    if (error) return Response.json({ error: error.message }, { status: 500 });

    // Process data
    const stats = {
      totalEvents: events?.length || 0,
      eventsByType: groupBy(events || [], "event"),
      timeline: generateTimeline(events || []),
      trends: calculateTrends(events || []),
    };

    return Response.json({
      success: true,
      userId,
      period,
      stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId, event, metadata } = await req.json();

    if (!userId || !event) {
      return Response.json({ error: "Missing userId or event" }, { status: 400 });
    }

    const { error } = await supabase.from("analytics").insert({
      user_id: userId,
      event,
      metadata: metadata || {},
      created_at: new Date(),
    });

    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ success: true });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

function groupBy(arr: any[], key: string): Record<string, number> {
  return arr.reduce((acc, obj) => {
    acc[obj[key]] = (acc[obj[key]] || 0) + 1;
    return acc;
  }, {});
}

function generateTimeline(events: any[]): any[] {
  const timeline: Record<string, number> = {};
  events.forEach((e) => {
    const date = new Date(e.created_at).toLocaleDateString();
    timeline[date] = (timeline[date] || 0) + 1;
  });
  return Object.entries(timeline).map(([date, count]) => ({ date, count }));
}

function calculateTrends(events: any[]): Record<string, number> {
  const lastDay = events.filter(
    (e) => new Date(e.created_at) > new Date(Date.now() - 86400000)
  ).length;
  const lastWeek = events.filter(
    (e) => new Date(e.created_at) > new Date(Date.now() - 604800000)
  ).length;
  return { lastDay, lastWeek, total: events.length };
}
