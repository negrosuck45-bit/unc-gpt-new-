import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { command } = await request.json();

    if (!command || typeof command !== 'string') {
      return NextResponse.json(
        { error: 'Command is required and must be a string' },
        { status: 400 }
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
          details: errorData 
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
    });

  } catch (error) {
    console.error('[v0] Terminal API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to execute command' },
      { status: 500 }
    );
  }
}
