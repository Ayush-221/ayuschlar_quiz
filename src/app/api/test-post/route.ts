import { NextResponse } from 'next/server';
import { runQuizSession } from '../cron/route';
import { supabase } from '@/lib/supabase';

const DEFAULT_GROUPS = [
  "@aiapgetexam",
  "@tmayu",
  "@ayuscholaraiapget"
];

// Post a single test question to verified channels
async function postTestQuestion(token: string, group: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const introText = `🧪 *AyuScholar Bot Test Connection*\n━━━━━━━━━━━━━━━━━━\n_Checking Telegram group permissions..._`;
    
    const introRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: group,
        text: introText,
        parse_mode: 'Markdown',
      }),
    });
    
    const introData = await introRes.json();
    if (!introData.ok) {
      return { ok: false, error: introData.description || 'Message post failed' };
    }
    
    await new Promise(r => setTimeout(r, 1000));

    const safeOpts = [
      "Option A (Select This to Pass) ✅",
      "Option B ❌",
      "Option C ❌",
      "Option D ❌"
    ];

    const res = await fetch(`https://api.telegram.org/bot${token}/sendPoll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: group,
        question: "🤖 Connection Test: Is this bot set up correctly as an Admin?",
        options: safeOpts,
        type: "quiz",
        correct_option_id: 0,
        explanation: "Success! The bot is successfully configured as an administrator and can post polls in this channel.",
        is_anonymous: true,
      }),
    });
    
    const data = await res.json();
    if (!data.ok) {
      return { ok: false, error: data.description || 'Poll post failed' };
    }
    
    return { ok: true };
  } catch (e: any) {
    console.error(`Error posting to ${group}:`, e);
    return { ok: false, error: e.message || 'Network request failed' };
  }
}

export async function POST(req: Request) {
  try {
    const { password, type } = await req.json();
    
    // Auth check
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    if (password !== adminPassword) {
      return NextResponse.json({ error: 'Invalid admin password' }, { status: 401 });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN env variable not set' }, { status: 500 });
    }

    if (type === 'test') {
      // Send a single mock question to verify connection
      let { data: dbGroups } = await supabase.from('groups').select('handle');
      let groups = dbGroups?.map(g => g.handle) || [];
      if (groups.length === 0) {
        groups = DEFAULT_GROUPS;
      }

      console.log('Running test post for groups:', groups);
      const results: Record<string, string | boolean> = {};
      
      for (const group of groups) {
        const res = await postTestQuestion(botToken, group);
        results[group] = res.ok ? true : (res.error || 'Failed');
        await new Promise(r => setTimeout(r, 2000));
      }

      const allSuccess = Object.values(results).every(v => v === true);
      
      // Log test post
      await supabase.from('logs').insert({
        session_label: 'Connection Test',
        status: allSuccess ? 'success' : 'failed',
        details: `Connection check triggered manually.\nResults per group:\n${JSON.stringify(results, null, 2)}`,
      });

      return NextResponse.json({
        message: allSuccess ? 'All test posts succeeded!' : 'Some test posts failed. Check logs.',
        results,
      });

    } else if (type === 'force') {
      // Force a regular scheduled session right now
      const label = `Manual Session (${new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false })})`;
      const result = await runQuizSession(label, botToken);

      return NextResponse.json({
        message: 'Manual session executed successfully',
        result,
      });
    }

    return NextResponse.json({ error: 'Invalid type parameter' }, { status: 400 });
  } catch (error: any) {
    console.error('Manual Session Trigger Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
