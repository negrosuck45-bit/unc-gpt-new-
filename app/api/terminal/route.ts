import { NextRequest, NextResponse } from 'next/server';

// In-memory rate limiting (daily limit per IP)
const commandCounts = new Map<string, { count: number; resetTime: number }>();
const DAILY_LIMIT = 50; // 50 commands per day (free tier)

function getRateLimitKey(request: NextRequest): string {
  const ip = request.headers.get('x-forwarded-for') || 
             request.headers.get('x-real-ip') || 
             'unknown';
  return ip.split(',')[0].trim();
}

function checkRateLimit(key: string): { allowed: boolean; remaining: number; resetTime: number } {
  const now = Date.now();
  const entry = commandCounts.get(key);
  
  if (!entry || now > entry.resetTime) {
    // Reset daily quota
    const resetTime = now + (24 * 60 * 60 * 1000);
    commandCounts.set(key, { count: 1, resetTime });
    return { allowed: true, remaining: DAILY_LIMIT - 1, resetTime };
  }
  
  if (entry.count >= DAILY_LIMIT) {
    return { allowed: false, remaining: 0, resetTime: entry.resetTime };
  }
  
  entry.count++;
  return { allowed: true, remaining: DAILY_LIMIT - entry.count, resetTime: entry.resetTime };
}

export async function POST(request: NextRequest) {
  try {
    const { command, action } = await request.json();

    // Handle stop command
    if (action === 'stop') {
      return NextResponse.json({
        status: 'stopped',
        message: 'Terminal session stopped',
      });
    }

    if (!command || typeof command !== 'string') {
      return NextResponse.json(
        { error: 'Command is required and must be a string' },
        { status: 400 }
      );
    }

    // Rate limiting
    const rateLimitKey = getRateLimitKey(request);
    const rateLimit = checkRateLimit(rateLimitKey);

    if (!rateLimit.allowed) {
      const resetDate = new Date(rateLimit.resetTime).toLocaleString();
      return NextResponse.json(
        { 
          error: 'Daily command limit reached (50 commands/day)',
          remaining: 0,
          resetTime: rateLimit.resetTime,
          resetDate,
        },
        { status: 429 }
      );
    }

    // Reject dangerous commands
    const dangerousPatterns = ['rm -rf', 'mkfs', ':(){:|:&', 'fork()', 'sudo', 'su -'];
    const commandLower = command.toLowerCase();
    if (dangerousPatterns.some(pattern => commandLower.includes(pattern))) {
      return NextResponse.json(
        { error: 'Command blocked for safety' },
        { status: 403 }
      );
    }

    const renderUrl = process.env.RENDER_TERMINAL_URL;
    const apiKey = process.env.RENDER_API_KEY;

    if (!renderUrl || !apiKey) {
      console.error('[v0] Render credentials missing:', { renderUrl: !!renderUrl, apiKey: !!apiKey });
      return NextResponse.json(
        { error: 'Render terminal not configured' },
        { status: 500 }
      );
    }

    console.log('[v0] Executing command via Render:', command);

    const response = await fetch(renderUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        command: command,
        timeout: 30000, // 30 second timeout
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('[v0] Render API error:', response.status, errorData);
      return NextResponse.json(
        { 
          error: `Render API error: ${response.status}`,
          details: errorData,
          remaining: rateLimit.remaining,
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('[v0] Command executed successfully:', { 
      command, 
      hasOutput: !!data.output,
      hasError: !!data.error 
    });

    return NextResponse.json({
      command,
      output: data.output || '',
      error: data.error || null,
      exitCode: data.exitCode || 0,
      remaining: rateLimit.remaining,
      resetTime: rateLimit.resetTime,
    });

  } catch (error) {
    console.error('[v0] Terminal API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to execute command' },
      { status: 500 }
    );
  }
}
