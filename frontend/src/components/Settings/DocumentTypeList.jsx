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
        <div style={{ color: '#5a6a62' }}>
          Вы уверены, что хотите удалить <strong>{id}</strong>?
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
      render: (id) => <code style={{ color: '#1a6b4a', fontSize: 13 }}>{id}</code>,
    },
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (name) => <span style={{ fontWeight: 500 }}>{name}</span>,
    },
    {
      title: 'Паттерны',
      dataIndex: 'text_patterns',
      key: 'text_patterns',
      render: (patterns) => (
        <Space size={4} wrap>
          {patterns?.map((p) => (
            <Tag key={p} style={{
              background: '#e6f2ed',
              border: '1px solid #b8d4c6',
              color: '#0d4a30',
              borderRadius: 4,
              fontSize: 12,
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
        <span style={{ color: '#5a6a62', fontSize: 13 }}>
          {record.min_pages}–{record.max_pages}
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
            <Button
              size="small"
              type="text"
              icon={<EditOutlined />}
              onClick={() => handleEdit(record)}
              style={{ color: '#4a8c70' }}
            />
          </Tooltip>
          <Tooltip title="Удалить">
            <Button
              size="small"
              type="text"
              danger
              icon={<DeleteOutlined />}
              onClick={() => handleDelete(record.id)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <>
      <div style={{ padding: '16px 24px', display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
          style={{ borderRadius: 6 }}
        >
          Добавить тип документа
        </Button>
      </div>
      <Table
        dataSource={documentTypes}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={false}
        style={{ borderTop: '1px solid #e8efe9' }}
      />
      <Modal
        title={
          <span style={{ color: '#0d4a30', fontWeight: 600 }}>
            {editing ? 'Редактировать тип документа' : 'Новый тип документа'}
          </span>
        }
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        destroyOnClose
        width={480}
      >
        <DocumentTypeForm
          initialValues={editing}
          onSuccess={() => {
            setModalOpen(false);
            message.success(editing ? 'Document type updated' : 'Document type created');
          }}
        />
      </Modal>
    </>
  );
};

export default DocumentTypeList;
