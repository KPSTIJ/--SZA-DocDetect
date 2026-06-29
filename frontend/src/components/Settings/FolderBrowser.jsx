import React, { useState, useEffect } from 'react';
import { Button, Space, Modal, Input, App, Breadcrumb } from 'antd';
import { FolderOutlined, FolderAddOutlined, ArrowLeftOutlined, CheckOutlined } from '@ant-design/icons';
import client from '../../api/client';

const FolderBrowser = ({ value, onChange, disabled }) => {
  const { message: appMsg } = App.useApp();
  const [open, setOpen] = useState(false);
  const [folders, setFolders] = useState([]);
  const [currentPath, setCurrentPath] = useState(value || '');
  const [loading, setLoading] = useState(false);
  const [newFolderModal, setNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) loadFolders(currentPath);
  }, [open, currentPath]);

  const loadFolders = async (path) => {
    setLoading(true);
    try {
      const res = await client.get('/smb/folders', { params: { path: path || '' } });
      setFolders(res.data);
    } catch {
      setFolders([]);
    } finally {
      setLoading(false);
    }
  };

  const handleNavigate = (folderName) => {
    setCurrentPath(p => p ? `${p}/${folderName}` : folderName);
  };

  const handleBack = () => {
    const parts = currentPath.split('/');
    parts.pop();
    setCurrentPath(parts.join('/'));
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    setSaving(true);
    try {
      await client.post('/smb/folders', { path: currentPath, name });
      appMsg.success(`Папка "${name}" создана`);
      setNewFolderModal(false);
      setNewFolderName('');
      loadFolders(currentPath);
    } catch (e) {
      appMsg.error(e?.response?.data?.detail || 'Ошибка создания папки');
    } finally {
      setSaving(false);
    }
  };

  const handleSelect = () => {
    onChange?.(currentPath);
    appMsg.success(`Выбрано: ${currentPath || '(корень)'}`);
    setOpen(false);
  };

  const handleOpen = () => {
    setCurrentPath(value || '');
    setOpen(true);
  };

  const pathParts = (currentPath || '').split('/').filter(Boolean);
  const canGoBack = !!currentPath;

  return (
    <>
      <Button size="large" block disabled={disabled}
        onClick={handleOpen}
        style={{
          marginTop: 8, borderRadius: 8, height: 44,
          borderColor: 'var(--border)',
          color: value ? 'var(--accent)' : '#d4943a',
          background: 'var(--bg-card)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >
        <FolderAddOutlined style={{ marginRight: 6 }} />
        {value ? `Выбрана папка ${value}` : 'Выбрать папку для выгрузки'}
      </Button>

      <Modal
        title={<span style={{ color: 'var(--text)', fontWeight: 600 }}>Выбор папки для выгрузки</span>}
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        width={600}
        destroyOnHidden
      >
        <div style={{
          border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden',
          background: 'var(--bg-card)',
        }}>
          <div style={{
            padding: '6px 10px', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 6, minHeight: 38,
          }}>
            <Button size="small" disabled={!canGoBack}
              onClick={handleBack}
              style={{ borderRadius: 6, display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, padding: '4px 10px' }}
            >
              <ArrowLeftOutlined /> Назад
            </Button>

            <Breadcrumb style={{ fontSize: 13 }}
              items={[
                {
                  title: <span onClick={() => setCurrentPath('')}
                    style={{ cursor: 'pointer', color: !currentPath ? 'var(--text)' : 'var(--accent)' }}>
                    cv_results
                  </span>,
                },
                ...pathParts.map((part, i) => ({
                  title: <span onClick={() => setCurrentPath(pathParts.slice(0, i + 1).join('/'))}
                    style={{
                      cursor: 'pointer',
                      color: i === pathParts.length - 1 ? 'var(--text)' : 'var(--accent)',
                    }}>
                    {part}
                  </span>,
                })),
              ]}
            />

            <div style={{ flex: 1 }} />

            <Button size="small" icon={<FolderAddOutlined />}
              onClick={() => setNewFolderModal(true)}
              style={{ borderRadius: 6, fontSize: 12, padding: '4px 8px' }}>
              Создать
            </Button>
          </div>

          <div style={{ padding: '4px', maxHeight: 300, overflowY: 'auto', minHeight: 80 }}>
            {loading ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)' }}>Загрузка...</div>
            ) : folders.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
                Папка пуста
              </div>
            ) : (
              folders.map((f) => (
                <div key={f.name}
                  onClick={() => handleNavigate(f.name)}
                  style={{
                    padding: '8px 12px', borderRadius: 6, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 8,
                    color: 'var(--text)', fontSize: 14,
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <FolderOutlined style={{ color: '#d4943a', fontSize: 18 }} />
                  {f.name}
                </div>
              ))
            )}
          </div>
        </div>

        <div style={{ marginTop: 12, textAlign: 'right' }}>
          <Space>
            <Button onClick={() => setOpen(false)} style={{ borderRadius: 6 }}>Отмена</Button>
            <Button type="primary" icon={<CheckOutlined />} onClick={handleSelect} style={{ borderRadius: 6 }}>
              Выбрать
            </Button>
          </Space>
        </div>
      </Modal>

      <Modal
        title={<span style={{ color: 'var(--text)', fontWeight: 600 }}>Новая папка</span>}
        open={newFolderModal}
        onCancel={() => setNewFolderModal(false)}
        onOk={handleCreateFolder}
        okText="Создать"
        cancelText="Отмена"
        confirmLoading={saving}
        destroyOnHidden
      >
        <Input placeholder="Название папки" value={newFolderName}
          onChange={e => setNewFolderName(e.target.value)}
          onPressEnter={handleCreateFolder}
          style={{ marginTop: 8 }} />
      </Modal>
    </>
  );
};

export default FolderBrowser;
