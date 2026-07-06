import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const password = formData.get('password') as string;
    const folder = formData.get('folder') as string; // 'folder1' or 'folder2'
    const file = formData.get('file') as File;

    // Verify Password
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    if (password !== adminPassword) {
      return NextResponse.json({ error: 'Invalid admin password' }, { status: 401 });
    }

    // Validate inputs
    if (folder !== 'folder1' && folder !== 'folder2') {
      return NextResponse.json({ error: 'Invalid folder choice. Must be folder1 or folder2' }, { status: 400 });
    }

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    if (!file.name.endsWith('.xlsx')) {
      return NextResponse.json({ error: 'Invalid file format. Only Excel files (.xlsx) are allowed' }, { status: 400 });
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Clean filename (remove special chars except underscores and hyphens)
    const cleanName = file.name.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    const storagePath = `${folder}/${cleanName}`;

    console.log(`Uploading file ${cleanName} to path ${storagePath}...`);

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from('quiz-sheets')
      .upload(storagePath, buffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        upsert: true,
      });

    if (error) {
      console.error('Storage Upload Error:', error);
      throw error;
    }

    // Reset progress on upload to make sure the new file is recognized and indexed properly
    const { data: progress } = await supabase.from('progress').select('*').eq('folder_name', folder).single();
    if (progress) {
      await supabase.from('progress').update({
        current_file_index: 0,
        used_indices: [],
        updated_at: new Date().toISOString(),
      }).eq('folder_name', folder);
    }

    return NextResponse.json({
      message: `Successfully uploaded ${cleanName} to ${folder}`,
      path: data.path,
    });

  } catch (error: any) {
    console.error('File Upload Route Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
