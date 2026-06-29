import React, { useState, useEffect, useRef } from 'react';
import { Button } from 'antd';
import { CloseOutlined, ReloadOutlined } from '@ant-design/icons';
import client from '../api/client';

const DevConsole = () => {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState([]);
  const scrollRef = useRef(null);

  const fetchLogs = async () => {
    try {
      const res = await client.get('/logs', { params: { lines: 200 } });
      setLogs(res.data.lines);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (open) {
      fetchLogs();
      const interval = setInterval(fetchLogs, 2000);
      return () => clearInterval(interval);
    }
  }, [open]);

  useEffect(() => {
    const handler = (e) => {
      if (e.shiftKey && e.altKey && e.key === 'm') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  if (!open) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, height: '35vh', zIndex: 5000,
      background: '#1a1b1e', borderTop: '2px solid #3a3d46',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        padding: '6px 12px', background: '#24262c', borderBottom: '1px solid #3a3d46',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
      }}>
        <span style={{ color: '#9ea3ad', fontSize: 12, fontWeight: 600 }}>Dev Console · Shift+Alt+M</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <Button size="small" icon={<ReloadOutlined />} onClick={fetchLogs}
            style={{ background: 'transparent', border: '1px solid #484b54', color: '#9ea3ad', borderRadius: 4 }} />
          <Button size="small" icon={<CloseOutlined />} onClick={() => setOpen(false)}
            style={{ background: 'transparent', border: '1px solid #484b54', color: '#9ea3ad', borderRadius: 4 }} />
        </div>
      </div>
      <div ref={scrollRef} style={{
        flex: 1, overflow: 'auto', padding: '8px 12px',
        fontFamily: 'monospace', fontSize: 11, lineHeight: '16px', whiteSpace: 'pre-wrap',
        color: '#bfc3cc',
      }}>
        {logs.length === 0 && (
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
    </div>
  );
};

export default DevConsole;
