import React from 'react';
import { Form, Input, InputNumber, Select, Button } from 'antd';
import useConfigStore from '../../store/configStore';

const DocumentTypeForm = ({ initialValues, onSuccess }) => {
  const [form] = Form.useForm();
  const { createDocumentType, updateDocumentType } = useConfigStore();

  const handleFinish = async (values) => {
    try {
      if (initialValues) {
        await updateDocumentType(initialValues.id, values);
      } else {
        await createDocumentType(values);
      }
      onSuccess?.();
    } catch {
      // error handled by store
    }
  };

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={initialValues || { text_patterns: [], min_pages: 1, max_pages: 10 }}
      onFinish={handleFinish}
      style={{ marginTop: 8 }}
    >
      <Form.Item
        name="id"
        label={<span style={{ fontWeight: 500, color: 'var(--text)' }}>ID (alias)</span>}
        rules={[
          { required: true, message: 'Обязательное поле' },
          { pattern: /^[a-z][a-z0-9_]*$/, message: 'Только [a-z0-9_], начинается с буквы' },
        ]}
      >
        <Input disabled={!!initialValues} placeholder="например, credit_agreement" />
      </Form.Item>
      <Form.Item
        name="name"
        label={<span style={{ fontWeight: 500, color: 'var(--text)' }}>Название</span>}
        rules={[{ required: true, message: 'Обязательное поле' }]}
      >
        <Input placeholder="например, Кредитный договор" />
      </Form.Item>
      <Form.Item
        name="text_patterns"
        label={<span style={{ fontWeight: 500, color: 'var(--text)' }}>Текстовые паттерны</span>}
        rules={[{ required: true, message: 'Нужен хотя бы один паттерн' }]}
      >
        <Select mode="tags" placeholder="Введите паттерн и нажмите Enter" />
      </Form.Item>
      <Form.Item
        name="min_pages"
        label={<span style={{ fontWeight: 500, color: 'var(--text)' }}>Мин. страниц</span>}
        rules={[{ required: true, message: 'Обязательное поле' }]}
      >
        <InputNumber min={1} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item
        name="max_pages"
        label={<span style={{ fontWeight: 500, color: 'var(--text)' }}>Макс. страниц</span>}
        rules={[{ required: true, message: 'Обязательное поле' }]}
      >
        <InputNumber min={1} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item style={{ marginBottom: 0 }}>
        <Button type="primary" htmlType="submit" block style={{ borderRadius: 6, height: 40 }}>
          {initialValues ? 'Сохранить' : 'Создать'}
        </Button>
      </Form.Item>
    </Form>
  );
};

export default DocumentTypeForm;
