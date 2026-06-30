import React, { useState, useEffect, useRef } from 'react';
import { Button } from 'antd';
import { CloseOutlined, ReloadOutlined } from '@ant-design/icons';
import client from '../api/client';
import useJobStore from '../store/jobStore';

const PANEL_WIDTH = 500;

const DevConsole = () => {
  const { logViewerOpen, closeLogViewer, pdfViewer } = useJobStore();
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);

  const pdfPanelWidth = pdfViewer.open ? Math.round((window.innerHeight - 100) * 210 / 297 + 40) : 0;

  const fetchLogs = async () => {
    try {
      const res = await client.get('/logs', { params: { lines: 200 } });
      setLogs(res.data.lines);
      setError(null);
    } catch {
      setError('Не удалось загрузить логи');
    }
  };

  useEffect(() => {
    if (logViewerOpen) {
      fetchLogs();
      const interval = setInterval(fetchLogs, 2000);
      return () => clearInterval(interval);
    }
  }, [logViewerOpen]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  useEffect(() => {
    const handler = (e) => {
      if (e.shiftKey && e.altKey && e.key === 'm') {
        e.preventDefault();
        useJobStore.getState().toggleLogViewer();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  if (!logViewerOpen) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, right: pdfPanelWidth, bottom: 0, width: PANEL_WIDTH, zIndex: 1100,
      background: '#1c1e24', borderLeft: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', boxShadow: '-6px 0 32px rgba(0,0,0,0.5)',
    }}>
      <div style={{
        padding: '12px 20px', borderBottom: '1px solid var(--border)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
        background: 'var(--bg-card)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
            Dev Console
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            Shift+Alt+M · {logs.length} строк
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button size="small" icon={<ReloadOutlined />} onClick={fetchLogs}
            style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-elevated)' }} />
          <Button size="small" icon={<CloseOutlined />} onClick={closeLogViewer}
            style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-elevated)' }} />
        </div>
      </div>

      <div ref={scrollRef} style={{
        flex: 1, overflow: 'auto', padding: '12px 16px',
        fontFamily: 'monospace', fontSize: 11, lineHeight: '16px', whiteSpace: 'pre-wrap',
        color: '#bfc3cc',
      }}>
        {error && (
          <div style={{ color: '#d13a3a', padding: 12 }}>{error}</div>
        )}
        {logs.length === 0 && !error && (
          <div style={{ color: '#6b7078', padding: 12 }}>Нет логов</div>
        )}
        {logs.map((line, i) => {
          let color = '#bfc3cc';
          if (line.includes('ERROR')) color = '#d13a3a';
          else if (line.includes('WARNING')) color = '#d4943a';
          else if (line.includes('INFO') && line.includes('orchestrator')) color = '#4a9eff';
          else if (line.includes('DEBUG')) color = '#6b7078';
          return <div key={i} style={{ color }}>{line.trimEnd()}</div>;
        })}
      </div>

      <div style={{
        padding: '8px 20px', borderTop: '1px solid var(--border)',
        display: 'flex', justifyContent: 'flex-end', flexShrink: 0,
        background: 'var(--bg-card)',
      }}>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
          Буфер: последние 500 строк · автообновление 2с
        </span>
      </div>
    </div>
  );
};

export default DevConsole;
