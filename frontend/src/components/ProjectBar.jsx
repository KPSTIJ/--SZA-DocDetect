import React, { useEffect, useState } from 'react';
import { Select, Button, Modal, Input, message } from 'antd';
import useProjectStore from '../store/projectStore';

const ProjectBar = () => {
  const { projects, selectedProjectId, loading, fetchProjects, createProject, setSelectedProject } = useProjectStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      await createProject(name);
      message.success('Проект создан');
      setModalOpen(false);
      setNewName('');
    } catch (e) {
      const msg = e?.response?.data?.detail || e?.message || 'Не удалось создать проект';
      message.error(msg);
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <div style={{
        background: 'var(--bg-card)', borderRadius: 10, border: '1px solid var(--border)',
        padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)', whiteSpace: 'nowrap' }}>Проект</span>
        <Select
          style={{ flex: 1, minWidth: 120 }}
          placeholder="Выберите проект"
          value={selectedProjectId}
          onChange={(v) => setSelectedProject(v)}
          loading={loading}
          options={projects.map((p) => ({ value: p.id, label: p.name }))}
          notFoundContent="Нет проектов"
        />
        <Button type="primary" onClick={() => setModalOpen(true)} style={{ borderRadius: 6, whiteSpace: 'nowrap', fontSize: 13, padding: '4px 12px', height: 32 }}>
          Создать проект
        </Button>
      </div>
        <Modal
          title={<span style={{ color: 'var(--text)', fontWeight: 600 }}>Новый проект</span>}
          open={modalOpen}
          onCancel={() => setModalOpen(false)}
          onOk={handleCreate}
          okText="Создать"
          cancelText="Отмена"
          confirmLoading={creating}
          destroyOnClose
        >
        <Input
          placeholder="Название проекта"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onPressEnter={handleCreate}
          style={{ marginTop: 8 }}
        />
      </Modal>
    </>
  );
};

export default ProjectBar;
