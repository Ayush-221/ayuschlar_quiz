'use client';

import React, { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';

export default function Dashboard() {
  // Core State
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Dashboard Data
  const [settings, setSettings] = useState({
    post_times: ['10:00', '21:00'],
    folder1_questions: 1,
    folder2_questions: 1,
  });
  
  const [progress, setProgress] = useState({
    folder1: { current_file_index: 0, used_indices: [] as number[], total_posted: 0, cycles: 0 },
    folder2: { current_file_index: 0, used_indices: [] as number[], total_posted: 0, cycles: 0 },
  });
  
  const [groups, setGroups] = useState<{ id: number; handle: string; created_at: string }[]>([]);
  const [logs, setLogs] = useState<{ id: number; session_label: string; status: string; details: string; created_at: string }[]>([]);
  
  const [files, setFiles] = useState({
    folder1: [] as { name: string; path: string; size: number; created_at: string }[],
    folder2: [] as { name: string; path: string; size: number; created_at: string }[],
  });

  // UI Interactive States
  const [activeFolderTab, setActiveFolderTab] = useState<'folder1' | 'folder2'>('folder1');
  const [newTimeInput, setNewTimeInput] = useState('');
  const [newGroupInput, setNewGroupInput] = useState('');
  const [expandedLogId, setExpandedLogId] = useState<number | null>(null);
  
  // Password State
  const [password, setPassword] = useState('');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ type: string; payload?: any } | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  // Upload progress states
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Test session trigger states
  const [triggeringTest, setTriggeringTest] = useState(false);
  const [triggeringForce, setTriggeringForce] = useState(false);

  // Load password from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedPass = localStorage.getItem('ayuscholar_admin_password');
      if (savedPass) setPassword(savedPass);
    }
    fetchDashboardData();
  }, []);

  // Fetch unified dashboard payload
  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin');
      if (!res.ok) throw new Error('Failed to fetch dashboard data');
      const data = await res.json();
      
      if (data.settings) setSettings(data.settings);
      if (data.progress) setProgress(data.progress);
      if (data.groups) setGroups(data.groups);
      if (data.logs) setLogs(data.logs);
      if (data.files) setFiles(data.files);
      setError(null);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred while loading dashboard data');
    } finally {
      setLoading(false);
    }
  };

  // Trigger admin operations securely (asks for password if not saved/invalid)
  const runSecureAction = (actionType: string, actionPayload?: any) => {
    const savedPassword = localStorage.getItem('ayuscholar_admin_password') || password;
    if (!savedPassword) {
      setPendingAction({ type: actionType, payload: actionPayload });
      setShowPasswordModal(true);
      setAuthError(null);
      return;
    }
    executeAction(actionType, savedPassword, actionPayload);
  };

  const executeAction = async (actionType: string, authPass: string, actionPayload?: any) => {
    setAuthError(null);
    try {
      // 1. Handle API Actions
      if (actionType === 'save-settings') {
        const res = await fetch('/api/admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'save-settings', password: authPass, payload: actionPayload }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to save settings');
        setSettings(data.settings);
        triggerSuccessConfetti();
      }
      
      else if (actionType === 'add-group') {
        const res = await fetch('/api/admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'add-group', password: authPass, payload: { handle: actionPayload } }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to add group');
        setGroups([...groups, data.group]);
        setNewGroupInput('');
      }
      
      else if (actionType === 'delete-group') {
        const res = await fetch('/api/admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'delete-group', password: authPass, payload: { id: actionPayload } }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to delete group');
        setGroups(groups.filter(g => g.id !== actionPayload));
      }
      
      else if (actionType === 'delete-file') {
        const res = await fetch('/api/admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'delete-file', password: authPass, payload: { path: actionPayload } }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to delete file');
        fetchDashboardData(); // Refresh progress and file counts
      }
      
      else if (actionType === 'reset-progress') {
        const res = await fetch('/api/admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'reset-progress', password: authPass, payload: { folder: actionPayload } }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to reset progress');
        setProgress({
          ...progress,
          [actionPayload]: data.progress,
        });
      }
      
      else if (actionType === 'trigger-test') {
        setTriggeringTest(true);
        const res = await fetch('/api/test-post', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: authPass, type: 'test' }),
        });
        const data = await res.json();
        setTriggeringTest(false);
        if (!res.ok) throw new Error(data.error || 'Failed to trigger test post');
        triggerSuccessConfetti();
        alert(data.message);
        fetchDashboardData(); // Refresh logs
      }
      
      else if (actionType === 'trigger-force') {
        setTriggeringForce(true);
        const res = await fetch('/api/test-post', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: authPass, type: 'force' }),
        });
        const data = await res.json();
        setTriggeringForce(false);
        if (!res.ok) throw new Error(data.error || 'Failed to force session run');
        triggerSuccessConfetti();
        alert(data.message);
        fetchDashboardData(); // Refresh logs and progress
      }

      // Save valid password
      localStorage.setItem('ayuscholar_admin_password', authPass);
      setPassword(authPass);
      setShowPasswordModal(false);
      setPendingAction(null);

    } catch (err: any) {
      console.error(err);
      if (err.message.includes('password') || err.message.includes('Unauthorized') || err.message.includes('Invalid admin password')) {
        setAuthError('Incorrect Admin Password. Please try again.');
        localStorage.removeItem('ayuscholar_admin_password');
        setShowPasswordModal(true);
      } else {
        alert(err.message || 'Operation failed');
      }
    }
  };

  const handlePasswordModalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setAuthError('Password is required');
      return;
    }
    if (pendingAction) {
      executeAction(pendingAction.type, password, pendingAction.payload);
    }
  };

  // Drag and Drop Upload Handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const savedPassword = localStorage.getItem('ayuscholar_admin_password') || password;
    if (!savedPassword) {
      setPendingAction({ type: 'upload-file', payload: { file, folder: activeFolderTab } });
      setShowPasswordModal(true);
      return;
    }

    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', activeFolderTab);
    formData.append('password', savedPassword);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Failed to upload file');
      
      setUploadSuccess(data.message);
      triggerSuccessConfetti();
      fetchDashboardData(); // Refresh file lists and progress
      
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: any) {
      console.error(err);
      if (err.message.includes('password') || err.message.includes('Invalid admin password')) {
        setPendingAction({ type: 'upload-file', payload: { file, folder: activeFolderTab } });
        setShowPasswordModal(true);
      } else {
        setUploadError(err.message || 'Failed to upload Excel file');
      }
    } finally {
      setUploading(false);
    }
  };

  // Add/Remove scheduled times helper
  const addPostTime = () => {
    if (!newTimeInput) return;
    if (!/^\d{2}:\d{2}$/.test(newTimeInput)) {
      alert('Time must be in HH:MM format (24 hour clock)');
      return;
    }
    if (settings.post_times.includes(newTimeInput)) {
      alert('This time slot is already scheduled');
      return;
    }
    const updatedTimes = [...settings.post_times, newTimeInput].sort();
    runSecureAction('save-settings', {
      ...settings,
      post_times: updatedTimes,
    });
    setNewTimeInput('');
  };

  const removePostTime = (timeToRemove: string) => {
    if (settings.post_times.length <= 1) {
      alert('You must have at least one scheduled posting time slot!');
      return;
    }
    const updatedTimes = settings.post_times.filter(t => t !== timeToRemove);
    runSecureAction('save-settings', {
      ...settings,
      post_times: updatedTimes,
    });
  };

  // Confetti on success
  const triggerSuccessConfetti = () => {
    confetti({
      particleCount: 80,
      spread: 60,
      origin: { y: 0.8 },
      colors: ['#f59e0b', '#ef4444', '#10b981'],
    });
  };

  // Utility helpers
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string) => {
    const d = new Date(dateString);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  if (loading && groups.length === 0) {
    return (
      <div className="modal-overlay">
        <div style={{ textAlign: 'center' }}>
          <svg className="animate-spin" width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
            <path d="M12 2C6.47715 2 2 6.47715 2 12C2 13.5997 2.37562 15.1116 3.0434 16.4527" stroke="#f59e0b" strokeWidth="4" strokeLinecap="round" />
          </svg>
          <p style={{ marginTop: '1rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-display)', fontWeight: 500 }}>
            Syncing control panel...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container animate-fade-in">
      {/* HEADER BAR */}
      <header className="glass-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1.5rem', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '2.2rem', fontWeight: 800 }} className="title-gradient">
            AyuScholar Control Panel
          </h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.2rem', fontSize: '0.95rem' }}>
            Telegram Quiz Bot Scheduler — Cloud Enterprise Version
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
          <span className="badge badge-success">
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }}></span>
            Cloud Server: Online
          </span>
          <span className="badge badge-warning">
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }}></span>
            Bot API Connected
          </span>
          <button 
            className="glass-btn glass-btn-secondary" 
            onClick={fetchDashboardData}
            style={{ padding: '0.5rem 0.8rem', borderRadius: 'var(--radius-sm)' }}
            title="Refresh dashboard data"
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
          </button>
        </div>
      </header>

      {/* STAT CARDS */}
      <section className="stats-row" style={{ marginBottom: '2rem' }}>
        <div className="glass-card">
          <div className="stat-item">
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600 }}>
              <span>ACTIVE SCHEDULES</span>
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <div className="stat-value" style={{ color: 'var(--accent-primary)' }}>
              {settings.post_times.join(' & ')}
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Daily post times (Asia/Kolkata IST)</p>
          </div>
        </div>

        <div className="glass-card">
          <div className="stat-item">
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600 }}>
              <span>TARGET CHANNELS</span>
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
            </div>
            <div className="stat-value" style={{ color: '#fff' }}>
              {groups.length} <span style={{ fontSize: '1rem', color: 'var(--text-secondary)', fontWeight: 400 }}>active groups</span>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Simultaneous postings enabled</p>
          </div>
        </div>

        <div className="glass-card">
          <div className="stat-item">
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600 }}>
              <span>FOLDER 1 (PRIMARY)</span>
              <span style={{ color: 'var(--accent-teal)', fontSize: '0.75rem', fontWeight: 700 }}>CYCLE {progress.folder1.cycles + 1}</span>
            </div>
            <div className="stat-value" style={{ color: 'var(--text-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div>
                {progress.folder1.total_posted} <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 400 }}>posted</span>
              </div>
              <button 
                onClick={() => runSecureAction('reset-progress', 'folder1')} 
                style={{ background: 'none', color: 'var(--accent-secondary)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
              >
                Reset Sheet
              </button>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Active Sheet Index: #{progress.folder1.current_file_index + 1} | Questions Used: {progress.folder1.used_indices.length}
            </p>
          </div>
        </div>

        <div className="glass-card">
          <div className="stat-item">
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600 }}>
              <span>FOLDER 2 (SECONDARY)</span>
              <span style={{ color: 'var(--accent-teal)', fontSize: '0.75rem', fontWeight: 700 }}>CYCLE {progress.folder2.cycles + 1}</span>
            </div>
            <div className="stat-value" style={{ color: 'var(--text-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div>
                {progress.folder2.total_posted} <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 400 }}>posted</span>
              </div>
              <button 
                onClick={() => runSecureAction('reset-progress', 'folder2')} 
                style={{ background: 'none', color: 'var(--accent-secondary)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
              >
                Reset Sheet
              </button>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Active Sheet Index: #{progress.folder2.current_file_index + 1} | Questions Used: {progress.folder2.used_indices.length}
            </p>
          </div>
        </div>
      </section>

      {/* DASHBOARD GRID */}
      <div className="dashboard-grid">
        
        {/* LEFT COLUMN: SETTINGS & EXCEL MANAGER */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {/* SCHEDULER & SESSION SETTINGS */}
          <section className="glass-card">
            <h2 style={{ fontSize: '1.4rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              Scheduled Session Settings
            </h2>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
              <div>
                <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                  FOLDER 1 QUESTIONS PER SESSION
                </label>
                <input 
                  type="number" 
                  min="0"
                  max="20"
                  className="glass-input" 
                  value={settings.folder1_questions} 
                  onChange={(e) => setSettings({ ...settings, folder1_questions: Number(e.target.value) })}
                />
              </div>
              <div>
                <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                  FOLDER 2 QUESTIONS PER SESSION
                </label>
                <input 
                  type="number" 
                  min="0"
                  max="20"
                  className="glass-input" 
                  value={settings.folder2_questions} 
                  onChange={(e) => setSettings({ ...settings, folder2_questions: Number(e.target.value) })}
                />
              </div>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                DAILY POST TIMES (24H HH:MM)
              </label>
              
              {/* Active times list chips */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', marginBottom: '0.8rem' }}>
                {settings.post_times.map(t => (
                  <span key={t} className="badge badge-warning" style={{ fontSize: '0.9rem', padding: '0.4rem 0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                    {t}
                    <button 
                      onClick={() => removePostTime(t)}
                      style={{ background: 'none', border: 'none', color: 'var(--accent-secondary)', fontWeight: 800, cursor: 'pointer', fontSize: '0.9rem' }}
                      title="Remove this time slot"
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>

              {/* Add time input */}
              <div style={{ display: 'flex', gap: '0.8rem', maxWidth: '300px' }}>
                <input 
                  type="text" 
                  placeholder="e.g. 15:30" 
                  maxLength={5}
                  className="glass-input" 
                  value={newTimeInput}
                  onChange={(e) => setNewTimeInput(e.target.value)}
                  style={{ padding: '0.5rem 1rem' }}
                />
                <button className="glass-btn glass-btn-secondary" onClick={addPostTime} style={{ padding: '0.5rem 1.2rem' }}>
                  Add
                </button>
              </div>
            </div>

            <button 
              className="glass-btn glass-btn-primary" 
              onClick={() => runSecureAction('save-settings', settings)}
              style={{ width: '100%' }}
            >
              Save Schedule Settings
            </button>
          </section>

          {/* EXCEL SHEET MANAGER */}
          <section className="glass-card">
            <h2 style={{ fontSize: '1.4rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              Excel Sheet Manager
            </h2>

            {/* Folder tab buttons */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--glass-border)', marginBottom: '1.5rem' }}>
              <button 
                onClick={() => { setActiveFolderTab('folder1'); setUploadError(null); setUploadSuccess(null); }}
                style={{ 
                  flex: 1, 
                  background: 'none', 
                  color: activeFolderTab === 'folder1' ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  borderBottom: activeFolderTab === 'folder1' ? '2px solid var(--accent-primary)' : 'none',
                  padding: '0.8rem',
                  fontFamily: 'var(--font-display)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: '0.95rem'
                }}
              >
                Folder 1 ({files.folder1.length} sheets)
              </button>
              <button 
                onClick={() => { setActiveFolderTab('folder2'); setUploadError(null); setUploadSuccess(null); }}
                style={{ 
                  flex: 1, 
                  background: 'none', 
                  color: activeFolderTab === 'folder2' ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  borderBottom: activeFolderTab === 'folder2' ? '2px solid var(--accent-primary)' : 'none',
                  padding: '0.8rem',
                  fontFamily: 'var(--font-display)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: '0.95rem'
                }}
              >
                Folder 2 ({files.folder2.length} sheets)
              </button>
            </div>

            {/* File upload drag zone */}
            <div style={{ 
              border: '2px dashed var(--glass-border)', 
              borderRadius: 'var(--radius-md)', 
              padding: '2rem', 
              textAlign: 'center', 
              cursor: 'pointer', 
              marginBottom: '1.5rem',
              background: 'rgba(255,255,255,0.01)',
              transition: 'all 0.2s ease',
            }}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file && fileInputRef.current) {
                  // Construct synthetic change event
                  const dataTransfer = new DataTransfer();
                  dataTransfer.items.add(file);
                  fileInputRef.current.files = dataTransfer.files;
                  const event = { target: fileInputRef.current } as unknown as React.ChangeEvent<HTMLInputElement>;
                  handleFileUpload(event);
                }
              }}
            >
              <input 
                type="file" 
                accept=".xlsx" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                style={{ display: 'none' }} 
              />
              <svg style={{ color: 'var(--text-muted)', marginBottom: '0.8rem' }} width="36" height="36" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
              </svg>
              <p style={{ fontWeight: 500, fontSize: '0.95rem' }}>
                {uploading ? 'Processing & uploading...' : `Click or Drag .xlsx sheet to ${activeFolderTab === 'folder1' ? 'Folder 1' : 'Folder 2'}`}
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.3rem' }}>
                Sheet structure must match Question (col B), Options (col C-F), Correct (col G), Explanation (col H)
              </p>
            </div>

            {/* Upload notifications */}
            {uploadError && (
              <div className="badge badge-danger animate-fade-in" style={{ width: '100%', borderRadius: 'var(--radius-sm)', padding: '0.6rem 1rem', marginBottom: '1.5rem', display: 'block', textAlign: 'left' }}>
                {uploadError}
              </div>
            )}
            {uploadSuccess && (
              <div className="badge badge-success animate-fade-in" style={{ width: '100%', borderRadius: 'var(--radius-sm)', padding: '0.6rem 1rem', marginBottom: '1.5rem', display: 'block', textAlign: 'left' }}>
                {uploadSuccess}
              </div>
            )}

            {/* List of uploaded Excel files */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              <h3 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 700, letterSpacing: '0.05em' }}>
                UPLOADED SHEETS (AUTO-SORTED ALPHABETICALLY)
              </h3>
              
              {files[activeFolderTab].length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontStyle: 'italic', padding: '1rem', border: '1px solid rgba(255,255,255,0.02)', borderRadius: 'var(--radius-md)', background: 'rgba(0,0,0,0.1)' }}>
                  No Excel sheets uploaded yet in this folder.
                </div>
              ) : (
                files[activeFolderTab].map((file, idx) => (
                  <div key={file.path} className="glass-card" style={{ padding: '0.8rem 1.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                      <span style={{ background: progress[activeFolderTab].current_file_index === idx ? 'var(--accent-primary)' : 'var(--bg-tertiary)', color: progress[activeFolderTab].current_file_index === idx ? '#000' : 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 800, width: '22px', height: '22px', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} title={progress[activeFolderTab].current_file_index === idx ? 'Current active sheet posting' : 'Queued sheet'}>
                        {progress[activeFolderTab].current_file_index === idx ? '▶' : idx + 1}
                      </span>
                      <div>
                        <p style={{ fontWeight: 600, fontSize: '0.9rem', color: progress[activeFolderTab].current_file_index === idx ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                          {file.name}
                        </p>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginTop: '0.1rem' }}>
                          Size: {formatBytes(file.size)} | Added {formatDate(file.created_at)}
                        </p>
                      </div>
                    </div>
                    <button 
                      className="glass-btn glass-btn-danger" 
                      onClick={() => {
                        if (confirm(`Are you sure you want to delete ${file.name}? This will reset progress for this folder.`)) {
                          runSecureAction('delete-file', file.path);
                        }
                      }}
                      style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem', borderRadius: 'var(--radius-sm)' }}
                      title="Delete sheet"
                    >
                      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        {/* RIGHT COLUMN: GROUPS, MANUAL CONTROLS, LOGS */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {/* INSTANT TRIGGERS / TEST CONNECTION */}
          <section className="glass-card">
            <h2 style={{ fontSize: '1.4rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              Manual Operations
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <button 
                  className="glass-btn glass-btn-secondary" 
                  onClick={() => runSecureAction('trigger-test')}
                  disabled={triggeringTest || triggeringForce}
                  style={{ width: '100%' }}
                >
                  {triggeringTest ? (
                    <>
                      <svg className="animate-spin" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18" /></svg>
                      Sending Connection Test...
                    </>
                  ) : (
                    <>
                      <span style={{ fontSize: '1.1rem' }}>🧪</span> Send Connection Test Quiz
                    </>
                  )}
                </button>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem', textAlign: 'center' }}>
                  Posts a single mock verification poll to all active groups (doesn't use sheet progress)
                </p>
              </div>

              <div>
                <button 
                  className="glass-btn glass-btn-primary" 
                  onClick={() => {
                    if (confirm('Are you sure you want to force posting a quiz session right now? This will increment active sheet progress as configured.')) {
                      runSecureAction('trigger-force');
                    }
                  }}
                  disabled={triggeringTest || triggeringForce}
                  style={{ width: '100%' }}
                >
                  {triggeringForce ? (
                    <>
                      <svg className="animate-spin" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18" /></svg>
                      Executing Quiz Session...
                    </>
                  ) : (
                    <>
                      <span style={{ fontSize: '1.1rem' }}>📤</span> Trigger Full Quiz Session Now
                    </>
                  )}
                </button>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem', textAlign: 'center' }}>
                  Instantly posts the configured amount of questions from folder1 and folder2 right now
                </p>
              </div>
            </div>
          </section>

          {/* TELEGRAM TARGET CHANNELS */}
          <section className="glass-card">
            <h2 style={{ fontSize: '1.4rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
              Telegram Target Groups
            </h2>
            
            {/* List of active groups */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1.2rem' }}>
              {groups.map(group => (
                <div key={group.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 1rem', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)', background: 'rgba(0,0,0,0.1)' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--accent-teal)' }}>{group.handle}</span>
                  <button 
                    onClick={() => {
                      if (confirm(`Remove group ${group.handle}?`)) {
                        runSecureAction('delete-group', group.id);
                      }
                    }}
                    style={{ background: 'none', border: 'none', color: 'var(--accent-secondary)', cursor: 'pointer' }}
                    title="Remove group"
                  >
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              ))}
            </div>

            {/* Add group input */}
            <div style={{ display: 'flex', gap: '0.8rem' }}>
              <input 
                type="text" 
                placeholder="e.g. @aiapgetexam" 
                className="glass-input" 
                value={newGroupInput}
                onChange={(e) => setNewGroupInput(e.target.value)}
                style={{ padding: '0.5rem 1rem' }}
              />
              <button 
                className="glass-btn glass-btn-secondary" 
                onClick={() => {
                  if (newGroupInput) runSecureAction('add-group', newGroupInput);
                }}
                style={{ padding: '0.5rem 1.2rem' }}
              >
                Add
              </button>
            </div>
            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
              The Telegram Bot must be added to these channels/groups as an Administrator with posting permissions.
            </p>
          </section>

          {/* RECENT SESSION LOGBOOK */}
          <section className="glass-card">
            <h2 style={{ fontSize: '1.4rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              Live Session Logs
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', maxHeight: '400px', overflowY: 'auto' }}>
              {logs.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontStyle: 'italic', padding: '1rem', border: '1px solid rgba(255,255,255,0.02)', borderRadius: 'var(--radius-md)', background: 'rgba(0,0,0,0.1)' }}>
                  No session logs found yet. Runs will be recorded here.
                </div>
              ) : (
                logs.map(log => (
                  <div key={log.id} style={{ border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                    
                    {/* Log Header bar */}
                    <div 
                      onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
                      style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center', 
                        padding: '0.8rem 1rem', 
                        background: 'rgba(255,255,255,0.02)', 
                        cursor: 'pointer',
                        userSelect: 'none'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <span className={`badge ${log.status === 'success' ? 'badge-success' : 'badge-danger'}`} style={{ padding: '0.2rem 0.4rem', borderRadius: '4px' }}>
                          {log.status === 'success' ? '✓' : '✗'}
                        </span>
                        <div>
                          <p style={{ fontWeight: 600, fontSize: '0.85rem' }}>{log.session_label}</p>
                          <p style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{formatDate(log.created_at)}</p>
                        </div>
                      </div>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {expandedLogId === log.id ? '▲' : '▼'}
                      </span>
                    </div>

                    {/* Expanded Log Details */}
                    {expandedLogId === log.id && (
                      <div style={{ 
                        padding: '1rem', 
                        background: 'rgba(0, 0, 0, 0.4)', 
                        borderTop: '1px solid var(--glass-border)',
                        fontFamily: 'monospace',
                        fontSize: '0.75rem',
                        color: 'var(--text-secondary)',
                        whiteSpace: 'pre-wrap',
                        maxHeight: '200px',
                        overflowY: 'auto'
                      }}>
                        {log.details || 'No detailed log messages recorded.'}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>

        </div>
      </div>

      {/* ADMIN AUTHENTICATION PASSWORD MODAL */}
      {showPasswordModal && (
        <div className="modal-overlay">
          <div className="glass-card modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
              Admin Protection
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
              To save these settings or execute manual operations, please enter the AyuScholar shared admin password.
            </p>

            <form onSubmit={handlePasswordModalSubmit}>
              <div style={{ marginBottom: '1.5rem' }}>
                <input 
                  type="password" 
                  placeholder="Enter shared admin password" 
                  className="glass-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                />
                {authError && (
                  <p style={{ color: 'var(--accent-secondary)', fontSize: '0.8rem', marginTop: '0.4rem', fontWeight: 500 }}>
                    {authError}
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <button 
                  type="button" 
                  className="glass-btn glass-btn-secondary" 
                  onClick={() => {
                    setShowPasswordModal(false);
                    setPendingAction(null);
                  }}
                  style={{ padding: '0.6rem 1.2rem' }}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="glass-btn glass-btn-primary"
                  style={{ padding: '0.6rem 1.6rem' }}
                >
                  Authenticate
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
