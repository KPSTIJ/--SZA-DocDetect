import React, { useEffect } from 'react';
import { Upload, Button, List, Tag, message } from 'antd';
import { InboxOutlined, PlayCircleOutlined, FolderOpenOutlined } from '@ant-design/icons';
import useJobStore from '../../store/jobStore';

const { Dragger } = Upload;

const statusConfig = {
  pending: { color: 'var(--text-tertiary)', bg: 'var(--bg-elevated)', label: 'Ожидает' },
  running: { color: 'var(--accent)', bg: 'var(--accent-bg)', label: 'В обработке' },
  done: { color: 'var(--accent)', bg: 'var(--accent-bg)', label: 'Готово' },
  failed: { color: '#d13a3a', bg: 'rgba(209,58,58,0.12)', label: 'Ошибка' },
  needs_review: { color: '#d4943a', bg: 'rgba(212,148,58,0.12)', label: 'На проверке' },
};

const labelStyle = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8,
  width: '100%', height: 44, borderRadius: 8, fontSize: 15, cursor: 'pointer',
  border: '1px solid var(--border)', color: 'var(--text-secondary)',
  background: 'var(--bg-card)', transition: 'background 0.15s',
};

const UploadSection = () => {
  const { jobs, loading, uploadFiles, startBatch, fetchJobs, startPolling, stopPolling } = useJobStore();
  const dirInputRef = React.useRef(null);

  useEffect(() => {
    fetchJobs();
    startPolling();
    return () => stopPolling();
  }, [fetchJobs, startPolling, stopPolling]);

  const handleUpload = async (file) => {
    await uploadFiles([file]);
    message.success(`"${file.name}" загружен`);
    return false;
  };

  const handleDirPick = async () => {
    const files = dirInputRef.current?.files;
    if (!files || files.length === 0) return;
    const pdfs = [];
    for (const f of files) {
      if (f.name.toLowerCase().endsWith('.pdf')) pdfs.push(f);
    }
    if (pdfs.length === 0) { message.warning('В выбранной папке нет PDF-файлов'); return; }
    await uploadFiles(pdfs);
    message.success(`Загружено ${pdfs.length} PDF-файлов из папки`);
    dirInputRef.current.value = '';
  };

  const handleBatch = async () => {
    try { await startBatch(); message.success('Обработка запущена'); }
    catch { message.error('Нет задач в очереди'); }
  };

  const pendingCount = jobs.filter((j) => j.status === 'pending').length;

  return (
    <div>
      <Dragger accept=".pdf" multiple beforeUpload={handleUpload} showUploadList={false}
        style={{ background: 'var(--dragger-bg)', border: '2px dashed var(--border)', borderRadius: 10, padding: 24 }}
      >
        <div style={{ fontSize: 40, color: 'var(--accent)', marginBottom: 8 }}><InboxOutlined /></div>
        <p style={{ color: 'var(--text)', fontSize: 15, marginBottom: 4 }}>Нажмите или перетащите PDF-файлы</p>
        <p style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>Поддерживается загрузка нескольких файлов</p>
      </Dragger>
      <label style={labelStyle}
        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-elevated)'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'var(--bg-card)'}
      >
        <FolderOpenOutlined />
        <span>Выбрать папку с PDF</span>
        <input ref={dirInputRef} type="file" webkitdirectory="" directory="" multiple onChange={handleDirPick} style={{ display: 'none' }} />
      </label>
      <label style={labelStyle}
        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-elevated)'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'var(--bg-card)'}
      >
        <FolderOpenOutlined />
        <span>Выбрать папку для результатов</span>
        <input type="file" webkitdirectory="" directory="" multiple onChange={() => message.success('Директория для результатов выбрана')} style={{ display: 'none' }} />
      </label>
      <Button type="primary" icon={<PlayCircleOutlined />} size="large" block
        style={{ marginTop: 8, borderRadius: 8, height: 44 }}
        onClick={handleBatch} loading={loading} disabled={pendingCount === 0}
      >Запустить обработку{pendingCount > 0 ? ` (${pendingCount} в очереди)` : ''}</Button>
      {jobs.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
            Последние загрузки
          </div>
          <List size="small" dataSource={jobs.slice(0, 10)}
            renderItem={(job) => {
              const sc = statusConfig[job.status] || statusConfig.pending;
              return (
                <List.Item style={{ padding: '8px 12px', borderRadius: 6, marginBottom: 4, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                  <List.Item.Meta
                    title={<span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{job.source_filename}</span>}
                    description={<span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{job.total_pages || '?'} стр.</span>}
                  />
                  <Tag style={{ background: sc.bg, color: sc.color, border: 'none', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>{sc.label}</Tag>
                </List.Item>
              );
            }}
          />
        </div>
      )}
    </div>
  );
};

export default UploadSection;
