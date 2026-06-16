import React from 'react';
import { createPortal } from 'react-dom';
import { Button, Select, Space, Tag } from 'antd';
import useJobStore from '../../store/jobStore';
import useConfigStore from '../../store/configStore';

const FloatingAssignToolbar = ({ jobId }) => {
  const selectedPages = useJobStore((s) => s.selectedPages[jobId] || new Set());
  const patchPages = useJobStore((s) => s.patchPages);
  const clearSelection = useJobStore((s) => s.clearSelection);
  const documentTypes = useConfigStore((s) => s.documentTypes);
  const [selectedType, setSelectedType] = React.useState(null);

  if (selectedPages.size === 0) return null;

  const handleApply = async () => {
    const docTypeId = selectedType === '__undetected__' ? null : selectedType;
    const assignments = Array.from(selectedPages).map((pageNum) => ({ page_number: pageNum, document_type_id: docTypeId }));
    await patchPages(jobId, assignments);
    setSelectedType(null);
  };

  const handleCancel = () => { clearSelection(jobId); setSelectedType(null); };

  return createPortal(
    <div style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      background: 'var(--bg-elevated)', padding: '12px 20px', borderRadius: 10,
      boxShadow: '0 4px 20px rgba(0,0,0,0.5)', border: '1px solid var(--border)',
      zIndex: 1000, display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <Tag style={{ background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', color: 'var(--accent)', borderRadius: 6, padding: '2px 10px', fontWeight: 600, fontSize: 13 }}>
        {selectedPages.size} стр.
      </Tag>
      <Select style={{ width: 200 }} placeholder="Назначить тип..." allowClear value={selectedType} onChange={setSelectedType}
        options={[...documentTypes.map((dt) => ({ label: dt.name, value: dt.id })), { label: 'Не распознан', value: '__undetected__' }]} />
      <Space>
        <Button type="primary" onClick={handleApply} disabled={!selectedType} style={{ borderRadius: 6 }}>Применить</Button>
        <Button onClick={handleCancel} style={{ borderRadius: 6 }}>Отмена</Button>
      </Space>
    </div>,
    document.body,
  );
};

export default FloatingAssignToolbar;
