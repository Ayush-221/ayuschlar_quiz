import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { parseQuestionsFromBuffer } from '@/lib/excel';

export const dynamic = 'force-dynamic';

const DEFAULT_SETTINGS = {
  post_times: ["10:00", "21:00"],
  folder1_questions: 1,
  folder2_questions: 1,
};

const DEFAULT_GROUPS = [
  "@aiapgetexam",
  "@tmayu",
  "@ayuscholaraiapget"
];

// Helper to get time and date in IST (Asia/Kolkata)
function getISTTimeInfo() {
  const date = new Date();
  
  // Format time (HH:MM)
  const timeStr = date.toLocaleTimeString('en-US', {
    timeZone: 'Asia/Kolkata',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  });
  
  // Format date (YYYY-MM-DD)
  const dateStr = date.toLocaleDateString('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  
  const [m, d, y] = dateStr.split('/');
  const formattedDate = `${y}-${m}-${d}`;
  
  return { timeStr, dateStr: formattedDate };
}

// Fetch list of Excel files in a folder, sorted alphabetically
async function getExcelFiles(folder: string): Promise<string[]> {
  const { data, error } = await supabase.storage.from('quiz-sheets').list(folder, {
    sortBy: { column: 'name', order: 'asc' },
  });
  
  if (error || !data) {
    console.error(`Error listing storage files in ${folder}:`, error);
    return [];
  }
  
  return data
    .filter(f => f.name.endsWith('.xlsx'))
    .map(f => `${folder}/${f.name}`);
}

// Download Excel file from Storage and parse it
async function loadQuestionsFromFile(filepath: string) {
  const { data, error } = await supabase.storage.from('quiz-sheets').download(filepath);
  
  if (error || !data) {
    throw new Error(`Failed to download file ${filepath}: ${error?.message}`);
  }
  
  const arrayBuffer = await data.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return parseQuestionsFromBuffer(buffer);
}

// Load current progress state
async function loadProgress(folder: string) {
  const { data, error } = await supabase
    .from('progress')
    .select('*')
    .eq('folder_name', folder)
    .single();
  
  if (error || !data) {
    return {
      folder_name: folder,
      current_file_index: 0,
      used_indices: [] as number[],
      total_posted: 0,
      cycles: 0,
    };
  }
  
  return {
    folder_name: data.folder_name,
    current_file_index: data.current_file_index ?? 0,
    used_indices: (data.used_indices || []) as number[],
    total_posted: data.total_posted ?? 0,
    cycles: data.cycles ?? 0,
  };
}

// Save progress state
async function saveProgress(p: any) {
  await supabase
    .from('progress')
    .upsert({
      folder_name: p.folder_name,
      current_file_index: p.current_file_index,
      used_indices: p.used_indices,
      total_posted: p.total_posted,
      cycles: p.cycles,
      updated_at: new Date().toISOString(),
    });
}

// Pull next N questions, auto-advancing sheets if exhausted
async function getNextQuestions(folder: string, n: number): Promise<{ selected: any[], sheetName: string }> {
  if (n === 0) {
    return { selected: [], sheetName: '—' };
  }

  const allFiles = await getExcelFiles(folder);
  if (allFiles.length === 0) {
    console.error(`No Excel files in '${folder}'!`);
    return { selected: [], sheetName: folder };
  }

  const progress = await loadProgress(folder);

  // If index is past the last file, reset and cycle
  if (progress.current_file_index >= allFiles.length) {
    console.info(`All sheets in '${folder}' done — restarting from sheet 1!`);
    progress.current_file_index = 0;
    progress.used_indices = [];
    progress.cycles += 1;
    await saveProgress(progress);
  }

  const curIdx = progress.current_file_index;
  const curFile = allFiles[curIdx];
  const baseName = curFile.split('/').pop() || '';
  const sheetName = baseName.replace(/\.xlsx$/i, '').replace(/_/g, ' ').replace(/-/g, ' ');

  let questions: any[] = [];
  try {
    questions = await loadQuestionsFromFile(curFile);
  } catch (err) {
    console.error(`Error loading questions from ${curFile}:`, err);
    // Move to next file if loading fails
    progress.current_file_index += 1;
    progress.used_indices = [];
    await saveProgress(progress);
    return getNextQuestions(folder, n);
  }

  const used = new Set(progress.used_indices);
  const unused: number[] = [];
  for (let i = 0; i < questions.length; i++) {
    if (!used.has(i)) {
      unused.push(i);
    }
  }

  // If not enough questions remaining, complete sheet and go to next
  if (unused.length < n) {
    console.info(`Sheet '${sheetName}' complete — moving to next sheet`);
    progress.current_file_index += 1;
    progress.used_indices = [];
    await saveProgress(progress);
    return getNextQuestions(folder, n);
  }

  const selectedIdx = unused.slice(0, n);
  const selected = selectedIdx.map(i => questions[i]);
  progress.used_indices.push(...selectedIdx);
  progress.total_posted += selected.length;
  await saveProgress(progress);

  return { selected, sheetName };
}

// Fetch configured groups (with fallback to default and auto-initialization)
async function getTelegramGroups(): Promise<string[]> {
  const { data, error } = await supabase
    .from('groups')
    .select('handle');
  
  if (error || !data || data.length === 0) {
    if (data && data.length === 0) {
      const inserts = DEFAULT_GROUPS.map(handle => ({ handle }));
      await supabase.from('groups').insert(inserts);
    }
    return DEFAULT_GROUPS;
  }
  
  return data.map(g => g.handle);
}

// Post a single question using the Telegram Bot API via fetch
async function postToGroup(token: string, group: string, question: any, qNum: number, total: number, sessionLabel: string, sheetName: string) {
  try {
    // Send session introduction message on Q1
    if (qNum === 1) {
      const introText = `📚 *${sheetName}*\n*${sessionLabel}*\n━━━━━━━━━━━━━━━━━━\n_${total} questions today_`;
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: group,
          text: introText,
          parse_mode: 'Markdown',
        }),
      });
      await new Promise(r => setTimeout(r, 1000));
    }

    const qText = question.question;
    let pollQ = '';
    
    if (qText.length > 245) {
      // Send question text as message first
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: group,
          text: `*Q${qNum}/${total}*\n\n${qText}`,
          parse_mode: 'Markdown',
        }),
      });
      await new Promise(r => setTimeout(r, 1000));
      pollQ = `Q${qNum}/${total} — See question above 👆`;
    } else {
      pollQ = `Q${qNum}/${total} — ${qText}`;
    }

    // Limit options length to Telegram standards
    const safeOpts = question.options.map((o: string) => o.length > 100 ? o.substring(0, 97) + '…' : o);
    const correctLetter = ['A', 'B', 'C', 'D'][question.correct_idx];
    let explanation = question.explanation 
      ? `✅ ${correctLetter} | 📖 ${question.explanation}`
      : `✅ Answer: ${correctLetter}`;
    
    if (explanation.length > 200) {
      explanation = explanation.substring(0, 197) + '…';
    }

    const res = await fetch(`https://api.telegram.org/bot${token}/sendPoll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: group,
        question: pollQ.substring(0, 255),
        options: safeOpts,
        type: 'quiz',
        correct_option_id: question.correct_idx,
        explanation: explanation,
        is_anonymous: true,
      }),
    });
    
    const data = await res.json();
    return data.ok === true;
  } catch (e) {
    console.error(`Error posting to ${group}:`, e);
    return false;
  }
}

// Primary execution logic for a quiz session
export async function runQuizSession(sessionLabel: string, botToken: string) {
  const logMessages: string[] = [];
  const logInfo = (msg: string) => {
    console.log(msg);
    logMessages.push(msg);
  };

  logInfo(`Quiz Session Start: ${sessionLabel}`);

  // Fetch or initialize settings
  let { data: settings } = await supabase.from('settings').select('*').eq('id', 1).single();
  if (!settings) {
    const { data: newSettings } = await supabase
      .from('settings')
      .insert({
        id: 1,
        post_times: DEFAULT_SETTINGS.post_times,
        folder1_questions: DEFAULT_SETTINGS.folder1_questions,
        folder2_questions: DEFAULT_SETTINGS.folder2_questions,
      })
      .select('*')
      .single();
    settings = newSettings;
  }

  const f1Count = settings?.folder1_questions ?? 1;
  const f2Count = settings?.folder2_questions ?? 1;
  const total = f1Count + f2Count;

  if (total === 0) {
    logInfo('0 questions configured — skipping session');
    return { success: true, details: logMessages.join('\n') };
  }

  const f1Result = await getNextQuestions('folder1', f1Count);
  const f2Result = await getNextQuestions('folder2', f2Count);

  const allQuestions = [...f1Result.selected, ...f2Result.selected];
  if (allQuestions.length === 0) {
    logInfo('No questions available from either folder!');
    return { success: false, details: logMessages.join('\n') };
  }

  const sheetName = f1Count >= f2Count ? f1Result.sheetName : f2Result.sheetName;

  logInfo(`Questions: ${f1Result.selected.length} from folder1 (${f1Result.sheetName}) + ${f2Result.selected.length} from folder2 (${f2Result.sheetName})`);
  
  const groups = await getTelegramGroups();
  logInfo(`Posting to ${groups.length} groups...`);

  let overallSuccess = true;

  for (const group of groups) {
    logInfo(`  → Posting to ${group}`);
    
    for (let i = 0; i < allQuestions.length; i++) {
      const q = allQuestions[i];
      const ok = await postToGroup(botToken, group, q, i + 1, allQuestions.length, sessionLabel, sheetName);
      if (ok) {
        logInfo(`    Q${i + 1} ✅`);
        if (i < allQuestions.length - 1) {
          await new Promise(r => setTimeout(r, 3000));
        }
      } else {
        logInfo(`    Q${i + 1} ❌ — skipping group`);
        overallSuccess = false;
        break;
      }
    }
    await new Promise(r => setTimeout(r, 5000));
  }

  logInfo(`Session complete.`);

  // Write run log
  await supabase.from('logs').insert({
    session_label: sessionLabel,
    status: overallSuccess ? 'success' : 'failed',
    details: logMessages.join('\n'),
  });

  return { success: overallSuccess, details: logMessages.join('\n') };
}

// GET/POST endpoint called by the cron trigger
export async function GET(req: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.get('authorization');
    const { searchParams } = new URL(req.url);
    const paramSecret = searchParams.get('secret');

    // Secure the cron endpoint if a secret is set
    if (cronSecret && authHeader !== `Bearer ${cronSecret}` && paramSecret !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN env variable not set' }, { status: 500 });
    }

    // Load settings
    let { data: settings } = await supabase.from('settings').select('*').eq('id', 1).single();
    if (!settings) {
      const { data: newSettings } = await supabase
        .from('settings')
        .insert({
          id: 1,
          post_times: DEFAULT_SETTINGS.post_times,
          folder1_questions: DEFAULT_SETTINGS.folder1_questions,
          folder2_questions: DEFAULT_SETTINGS.folder2_questions,
        })
        .select('*')
        .single();
      settings = newSettings;
    }

    const postTimes: string[] = settings?.post_times || DEFAULT_SETTINGS.post_times;
    const { timeStr, dateStr } = getISTTimeInfo();

    console.log(`Cron check triggered at ${timeStr} (IST) on ${dateStr}. Scheduled times:`, postTimes);

    const [curHour, curMin] = timeStr.split(':').map(Number);
    const currentTimeMinutes = curHour * 60 + curMin;

    let matchedSlot: string | null = null;
    let matchedLabel = '';

    for (const t of postTimes) {
      const [schHour, schMin] = t.split(':').map(Number);
      const scheduledTimeMinutes = schHour * 60 + schMin;

      // Match window: scheduled time to scheduled time + 14 minutes
      const diff = currentTimeMinutes - scheduledTimeMinutes;
      if (diff >= 0 && diff < 15) {
        matchedSlot = t;
        matchedLabel = schHour < 12 ? 'Morning Quiz' : schHour < 17 ? 'Afternoon Quiz' : 'Evening Quiz';
        break;
      }
    }

    if (!matchedSlot) {
      return NextResponse.json({
        message: 'No scheduled slots match the current time window.',
        istTime: timeStr,
        date: dateStr,
      });
    }

    const fullSessionLabel = `${matchedLabel} (${matchedSlot})`;

    // Check if we already posted for this slot today
    const todayISTStart = new Date(`${dateStr}T00:00:00+05:30`);
    const { data: existingLogs } = await supabase
      .from('logs')
      .select('*')
      .eq('session_label', fullSessionLabel)
      .eq('status', 'success')
      .gte('created_at', todayISTStart.toISOString());

    if (existingLogs && existingLogs.length > 0) {
      return NextResponse.json({
        message: `Quiz session already posted for ${fullSessionLabel} today.`,
        istTime: timeStr,
        date: dateStr,
      });
    }

    // Run the session
    const result = await runQuizSession(fullSessionLabel, botToken);

    return NextResponse.json({
      message: `Successfully executed session: ${fullSessionLabel}`,
      result,
      istTime: timeStr,
      date: dateStr,
    });
  } catch (error: any) {
    console.error('Cron Execution Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
