import React, { useState } from 'react';
import { Table, Button, Tag, Space, Modal, message, Tooltip } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import DocumentTypeForm from './DocumentTypeForm';
import useConfigStore from '../../store/configStore';

const DocumentTypeList = () => {
  const { documentTypes, loading, deleteDocumentType } = useConfigStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const handleEdit = (record) => {
    setEditing(record);
    setModalOpen(true);
  };

  const handleDelete = (id) => {
    Modal.confirm({
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
      width: 160,
      render: (id) => <code style={{ color: 'var(--accent)', fontSize: 13 }}>{id}</code>,
    },
    {
      title: 'Название',
      dataIndex: 'name',
      key: 'name',
      render: (name) => <span style={{ fontWeight: 500, color: 'var(--text)' }}>{name}</span>,
    },
    {
      title: 'Паттерны',
      dataIndex: 'text_patterns',
      key: 'text_patterns',
      render: (patterns) => (
        <Space size={4} wrap>
          {patterns?.map((p) => (
            <Tag key={p} style={{
              background: 'var(--accent-bg)', border: '1px solid var(--accent-border)',
              color: 'var(--accent)', borderRadius: 4, fontSize: 12,
            }}>
              {p}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: 'Стр.',
      key: 'pages',
      width: 100,
      render: (_, record) => (
        <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
          {record.min_pages}&ndash;{record.max_pages}
        </span>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 100,
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
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); setModalOpen(true); }} style={{ borderRadius: 6 }}>
          Добавить тип документа
        </Button>
      </div>
      <Table
        dataSource={documentTypes}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={false}
      />
      <Modal
        title={<span style={{ color: 'var(--text)', fontWeight: 600 }}>{editing ? 'Редактировать тип документа' : 'Новый тип документа'}</span>}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        destroyOnClose
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
    </div>
  );
};

export default DocumentTypeList;
