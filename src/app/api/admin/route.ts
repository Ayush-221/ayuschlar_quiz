import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

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

// Helper to list Excel files from storage
async function listStorageFiles(folder: string) {
  const { data, error } = await supabase.storage.from('quiz-sheets').list(folder, {
    sortBy: { column: 'name', order: 'asc' },
  });
  
  if (error || !data) {
    console.error(`Error listing storage in ${folder}:`, error);
    return [];
  }
  
  return data
    .filter(f => f.name.endsWith('.xlsx'))
    .map(f => ({
      name: f.name,
      path: `${folder}/${f.name}`,
      size: f.metadata?.size || 0,
      created_at: f.created_at,
    }));
}

// GET handler: Fetch all dashboard data in a single request (no password needed for read)
export async function GET() {
  try {
    // 1. Fetch settings
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

    // 2. Fetch progress
    const { data: progressList } = await supabase.from('progress').select('*');
    const progressMap: Record<string, any> = {};
    progressList?.forEach(p => {
      progressMap[p.folder_name] = p;
    });

    const folder1Progress = progressMap['folder1'] || {
      folder_name: 'folder1',
      current_file_index: 0,
      used_indices: [],
      total_posted: 0,
      cycles: 0,
    };
    
    const folder2Progress = progressMap['folder2'] || {
      folder_name: 'folder2',
      current_file_index: 0,
      used_indices: [],
      total_posted: 0,
      cycles: 0,
    };

    // 3. Fetch groups
    let { data: groups } = await supabase.from('groups').select('*').order('created_at', { ascending: true });
    if (!groups || groups.length === 0) {
      const inserts = DEFAULT_GROUPS.map(handle => ({ handle }));
      await supabase.from('groups').insert(inserts);
      const { data: reGroups } = await supabase.from('groups').select('*').order('created_at', { ascending: true });
      groups = reGroups;
    }

    // 4. Fetch logs (last 25 logs)
    const { data: logs } = await supabase
      .from('logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(25);

    // 5. Fetch file lists from storage
    const folder1Files = await listStorageFiles('folder1');
    const folder2Files = await listStorageFiles('folder2');

    return NextResponse.json({
      settings,
      progress: {
        folder1: folder1Progress,
        folder2: folder2Progress,
      },
      groups: groups || [],
      logs: logs || [],
      files: {
        folder1: folder1Files,
        folder2: folder2Files,
      }
    });

  } catch (error: any) {
    console.error('Fetch Dashboard Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST handler: Secure write operations
export async function POST(req: Request) {
  try {
    const { action, password, payload } = await req.json();

    // Verify Password
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    if (password !== adminPassword) {
      return NextResponse.json({ error: 'Invalid admin password' }, { status: 401 });
    }

    switch (action) {
      case 'save-settings': {
        const { post_times, folder1_questions, folder2_questions } = payload;
        
        // Input validation
        if (!Array.isArray(post_times) || post_times.some(t => typeof t !== 'string' || !/^\d{2}:\d{2}$/.test(t))) {
          return NextResponse.json({ error: 'Invalid times format. Must be HH:MM' }, { status: 400 });
        }

        const { data, error } = await supabase
          .from('settings')
          .update({
            post_times,
            folder1_questions: Number(folder1_questions),
            folder2_questions: Number(folder2_questions),
            updated_at: new Date().toISOString(),
          })
          .eq('id', 1)
          .select('*')
          .single();

        if (error) throw error;
        return NextResponse.json({ message: 'Settings saved successfully', settings: data });
      }

      case 'add-group': {
        const { handle } = payload;
        if (!handle || typeof handle !== 'string' || (!handle.startsWith('@') && !handle.startsWith('-') && !/^\d+$/.test(handle))) {
          return NextResponse.json({ error: 'Invalid Telegram handle. Must start with @ or a minus sign (-) for numerical IDs' }, { status: 400 });
        }

        const { data, error } = await supabase
          .from('groups')
          .insert({ handle })
          .select('*')
          .single();

        if (error) {
          if (error.code === '23505') {
            return NextResponse.json({ error: 'Group already exists' }, { status: 400 });
          }
          throw error;
        }
        return NextResponse.json({ message: 'Group added successfully', group: data });
      }

      case 'delete-group': {
        const { id } = payload;
        if (!id) return NextResponse.json({ error: 'Missing group ID' }, { status: 400 });

        const { error } = await supabase
          .from('groups')
          .delete()
          .eq('id', id);

        if (error) throw error;
        return NextResponse.json({ message: 'Group deleted successfully' });
      }

      case 'delete-file': {
        const { path } = payload; // e.g. "folder1/sheet1.xlsx"
        if (!path) return NextResponse.json({ error: 'Missing file path' }, { status: 400 });

        const { error } = await supabase.storage.from('quiz-sheets').remove([path]);
        if (error) throw error;

        // Reset progress indices to prevent index-out-of-bounds error
        const folder = path.split('/')[0];
        const { data: progress } = await supabase.from('progress').select('*').eq('folder_name', folder).single();
        if (progress) {
          await supabase.from('progress').update({
            current_file_index: 0,
            used_indices: [],
            updated_at: new Date().toISOString(),
          }).eq('folder_name', folder);
        }

        return NextResponse.json({ message: 'File deleted successfully and progress reset' });
      }

      case 'reset-progress': {
        const { folder } = payload;
        if (folder !== 'folder1' && folder !== 'folder2') {
          return NextResponse.json({ error: 'Invalid folder name' }, { status: 400 });
        }

        const { data, error } = await supabase
          .from('progress')
          .upsert({
            folder_name: folder,
            current_file_index: 0,
            used_indices: [],
            cycles: 0,
            updated_at: new Date().toISOString(),
          })
          .select('*')
          .single();

        if (error) throw error;
        return NextResponse.json({ message: `Progress for ${folder} has been reset`, progress: data });
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }

  } catch (error: any) {
    console.error('POST Admin Operations Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
