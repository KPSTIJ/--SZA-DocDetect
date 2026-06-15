import React, { useEffect, useRef } from 'react';
import { Upload, Button, List, Tag, message, Tooltip } from 'antd';
import { InboxOutlined, PlayCircleOutlined, FolderOpenOutlined } from '@ant-design/icons';
import useJobStore from '../../store/jobStore';

const { Dragger } = Upload;

const statusColors = {
  pending: { color: '#909090', bg: '#f0f0f0' },
  running: { color: '#1a6b4a', bg: '#e6f2ed' },
  done: { color: '#1a6b4a', bg: '#e6f2ed' },
  failed: { color: '#c43a3a', bg: '#fce8e8' },
  needs_review: { color: '#d4943a', bg: '#fdf0e0' },
};

const UploadSection = () => {
  const { jobs, loading, uploadFiles, startBatch, fetchJobs, startPolling, stopPolling } =
    useJobStore();
  const dirInputRef = useRef(null);

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
      if (f.name.toLowerCase().endsWith('.pdf')) {
        pdfs.push(f);
      }
    }
    if (pdfs.length === 0) {
      message.warning('В выбранной папке нет PDF-файлов');
      return;
    }
    await uploadFiles(pdfs);
    message.success(`Загружено ${pdfs.length} PDF-файлов из папки`);
    dirInputRef.current.value = '';
  };

  const handleBatch = async () => {
    try {
      await startBatch();
      message.success('Обработка запущена');
    } catch {
      message.error('Нет задач в очереди');
    }
  };

  const pendingCount = jobs.filter((j) => j.status === 'pending').length;

  return (
    <div>
      <Dragger
        accept=".pdf"
        multiple
        beforeUpload={handleUpload}
        showUploadList={false}
        style={{
          background: '#f8fbf9',
          border: '2px dashed #b8d4c6',
          borderRadius: 10,
          padding: 24,
        }}
      >
        <div style={{ fontSize: 40, color: '#4a8c70', marginBottom: 8 }}>
          <InboxOutlined />
        </div>
        <p style={{ color: '#1a1a1a', fontSize: 15, marginBottom: 4 }}>Нажмите или перетащите PDF-файлы сюда</p>
        <p style={{ color: '#8a9a92', fontSize: 13 }}>Поддерживается загрузка нескольких файлов</p>
      </Dragger>

      <input
        ref={dirInputRef}
        type="file"
        webkitdirectory=""
        directory=""
        multiple
        onChange={handleDirPick}
        style={{ display: 'none' }}
      />

      <Button
        icon={<FolderOpenOutlined />}
        size="large"
        block
        style={{ marginTop: 8, borderRadius: 8, height: 44, borderColor: '#b8d4c6', color: '#1a6b4a' }}
        onClick={() => dirInputRef.current?.click()}
      >
        Выбрать папку с PDF
      </Button>

      <Button
        type="primary"
        icon={<PlayCircleOutlined />}
        size="large"
        block
        style={{ marginTop: 8, borderRadius: 8, height: 44 }}
        onClick={handleBatch}
        loading={loading}
        disabled={pendingCount === 0}
      >
        Запустить обработку{pendingCount > 0 ? ` (${pendingCount} в очереди)` : ''}
      </Button>

      {jobs.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#8a9a92', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
            Последние загрузки
          </div>
          <List
            size="small"
            dataSource={jobs.slice(0, 10)}
            renderItem={(job) => {
              const sc = statusColors[job.status] || statusColors.pending;
              return (
                <List.Item style={{ padding: '8px 12px', borderRadius: 6, marginBottom: 4, background: '#fafcfa' }}>
                  <List.Item.Meta
                    title={<span style={{ fontSize: 13, fontWeight: 500 }}>{job.source_filename}</span>}
                    description={<span style={{ fontSize: 12, color: '#8a9a92' }}>{job.total_pages || '?'} pages</span>}
                  />
                  <Tag style={{
                    background: sc.bg,
                    color: sc.color,
                    border: 'none',
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 600,
                  }}>
                    {job.status}
                  </Tag>
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
