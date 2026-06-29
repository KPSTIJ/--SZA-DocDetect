import React, { useState, useEffect } from 'react';
import { Upload, Button, message } from 'antd';
import { InboxOutlined, PlayCircleOutlined, FolderOpenOutlined } from '@ant-design/icons';
import useJobStore from '../../store/jobStore';
import useProjectStore from '../../store/projectStore';
import useConfigStore from '../../store/configStore';
import FolderBrowser from './FolderBrowser';
import client from '../../api/client';

const { Dragger } = Upload;

const UploadSection = () => {
  const { jobs, loading, uploadFiles, startBatch } = useJobStore();
  const selectedProjectId = useProjectStore((s) => s.selectedProjectId);
  const projects = useProjectStore((s) => s.projects);
  const documentTypes = useConfigStore((s) => s.documentTypes);
  const dirInputRef = React.useRef(null);
  const [finalDir, setFinalDir] = useState('');

  const currentProject = projects.find(p => String(p.id) === String(selectedProjectId));

  useEffect(() => {
    if (currentProject) {
      setFinalDir(currentProject.final_output_dir || '');
    } else {
      setFinalDir('');
    }
  }, [currentProject]);

  const handleFinalDirChange = async (dir) => {
    if (!selectedProjectId) return;
    try {
      await client.put(`/projects/${selectedProjectId}`, { final_output_dir: dir || '' });
      setFinalDir(dir);
    } catch {
      message.error('Ошибка сохранения директории');
    }
  };

  const getErrMsg = (e) => {
    const detail = e?.response?.data?.detail;
    if (!detail) return e?.message || 'Ошибка загрузки';
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) return detail.map(d => d.msg || JSON.stringify(d)).join('; ');
    return JSON.stringify(detail);
  };

  const handleUpload = async (file) => {
    try {
      await uploadFiles([file]);
      message.success(`"${file.name}" загружен`);
    } catch (e) {
      message.error(getErrMsg(e));
    }
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
    try {
      await uploadFiles(pdfs);
      message.success(`Загружено ${pdfs.length} PDF-файлов из папки`);
    } catch (e) {
      message.error(getErrMsg(e));
    }
    dirInputRef.current.value = '';
  };

  const handleBatch = async () => {
    try { await startBatch(); message.success('Обработка запущена'); }
    catch { message.error('Нет задач в очереди'); }
  };

  const pendingCount = jobs.filter((j) => j.status === 'pending').length;

  const disabled = !selectedProjectId;
  const noTypes = documentTypes.length === 0;
  const noFinalDir = !finalDir;

  return (
    <div>
      <input ref={dirInputRef} type="file" webkitdirectory="" directory="" multiple onChange={handleDirPick} style={{ display: 'none' }} />
      <Dragger accept=".pdf" multiple beforeUpload={disabled || noTypes || noFinalDir ? () => false : handleUpload} showUploadList={false} openFileDialogOnClick={!disabled && !noTypes && !noFinalDir}
        style={{
          background: disabled || noTypes || noFinalDir ? 'var(--bg-elevated)' : 'var(--dragger-bg)',
          border: `2px dashed ${disabled || noTypes || noFinalDir ? 'var(--bg-elevated)' : 'var(--border)'}`,
          borderRadius: 10, padding: 24, opacity: disabled || noTypes || noFinalDir ? 0.45 : 1,
          cursor: disabled || noTypes || noFinalDir ? 'not-allowed' : 'pointer',
        }}
      >
        <div style={{ fontSize: 40, color: disabled ? 'var(--text-tertiary)' : noTypes ? '#d4943a' : noFinalDir ? '#d4943a' : 'var(--accent)', marginBottom: 8 }}><InboxOutlined /></div>
        <p style={{ color: 'var(--text)', fontSize: 15, marginBottom: 4 }}>
          {noTypes ? 'Сначала создайте типы документов' : noFinalDir ? 'Выберите папку для выгрузки' : 'Нажмите или перетащите PDF-файлы'}
        </p>
        <p style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>PDF, до 100 МБ, несколько файлов</p>
      </Dragger>
      <Button icon={<FolderOpenOutlined />} size="large" block disabled={disabled || noTypes || noFinalDir}
        style={{ marginTop: 8, borderRadius: 8, height: 44, borderColor: 'var(--border)', color: 'var(--text-secondary)', background: 'var(--bg-card)' }}
        onClick={() => dirInputRef.current?.click()}
      >Выбрать папку с PDF</Button>

      {selectedProjectId && (
        <FolderBrowser
          value={finalDir}
          onChange={handleFinalDirChange}
          disabled={disabled}
        />
      )}

      <Button type="primary" icon={<PlayCircleOutlined />} size="large" block
        style={{ marginTop: 12, borderRadius: 8, height: 44 }}
        onClick={handleBatch} loading={loading} disabled={pendingCount === 0 || disabled || noTypes || noFinalDir}
      >Запустить обработку{pendingCount > 0 ? ` (${pendingCount} в очереди)` : ''}</Button>
    </div>
  );
};

export default UploadSection;
