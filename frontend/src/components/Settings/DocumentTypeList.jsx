import React, { useState } from 'react';
import { Table, Button, Space, Modal, message, Tooltip, App } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import DocumentTypeForm from './DocumentTypeForm';
import useConfigStore from '../../store/configStore';
import useProjectStore from '../../store/projectStore';

const DocumentTypeList = () => {
  const { documentTypes, loading, deleteDocumentType } = useConfigStore();
  const selectedProjectId = useProjectStore((s) => s.selectedProjectId);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [apiModal, apiModalCtx] = Modal.useModal();

  const handleEdit = (record) => {
    setEditing(record);
    setModalOpen(true);
  };

  const handleDelete = (id) => {
    apiModal.confirm({
      title: 'Удалить тип документа?',
      icon: null,
      content: (
        <div style={{ color: 'var(--text-secondary)' }}>
          Вы уверены, что хотите удалить <strong style={{ color: 'var(--text)' }}>{id}</strong>?
        </div>
      ),
      okText: 'Удалить',
      okButtonProps: { danger: true },
      onOk: () => deleteDocumentType(id),
    });
  };

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 140,
      render: (id) => <code style={{ color: 'var(--accent)', fontSize: 13 }}>{id}</code>,
    },
    {
      title: 'Название',
      dataIndex: 'name',
      key: 'name',
      width: 180,
      render: (name) => <span style={{ fontWeight: 500, color: 'var(--text)' }}>{name}</span>,
    },
    {
      title: 'Паттерны',
      dataIndex: 'text_patterns',
      key: 'text_patterns',
      width: 260,
      render: (patterns) => (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {patterns?.map((p) => {
            const truncated = p.length > 15 ? p.slice(0, 15) + '...' : p;
            return (
              <Tooltip key={p} title={p}>
                <span style={{
                  background: 'var(--accent-bg)', border: '1px solid var(--accent-border)',
                  color: 'var(--accent)', borderRadius: 4, fontSize: 12,
                  padding: '0 6px', lineHeight: '22px', cursor: 'default',
                }}>
                  {truncated}
                </span>
              </Tooltip>
            );
          })}
        </div>
      ),
    },
    {
      title: 'Стр.',
      key: 'pages',
      width: 80,
      render: (_, record) => (
        <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
          {record.min_pages}&ndash;{record.max_pages}
        </span>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 80,
      render: (_, record) => (
        <Space>
          <Tooltip title="Редактировать">
            <Button size="small" type="text" icon={<EditOutlined />} onClick={() => handleEdit(record)} style={{ color: 'var(--text-secondary)' }} />
          </Tooltip>
          <Tooltip title="Удалить">
            <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.id)} />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
      <div style={{
        padding: '16px 24px', borderBottom: '1px solid var(--border)',
        background: 'var(--bg-card)', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)' }}>Типы документов</span>
        <Button type="primary" icon={<PlusOutlined />} disabled={!selectedProjectId}
          onClick={() => { setEditing(null); setModalOpen(true); }} style={{ borderRadius: 6 }}>
          Добавить тип документа
        </Button>
      </div>
      {!selectedProjectId ? (
        <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 15 }}>
          Выберите проект
        </div>
      ) : (
      <Table
        dataSource={documentTypes}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={false}
      />
      )}
      <Modal
        title={<span style={{ color: 'var(--text)', fontWeight: 600 }}>{editing ? 'Редактировать тип документа' : 'Новый тип документа'}</span>}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        destroyOnHidden
        width={520}
      >
        <DocumentTypeForm
          initialValues={editing}
          onSuccess={() => {
            setModalOpen(false);
            message.success(editing ? 'Тип документа сохранён' : 'Тип документа создан');
          }}
        />
      </Modal>
      {apiModalCtx}
    </div>
  );
};

export default DocumentTypeList;
