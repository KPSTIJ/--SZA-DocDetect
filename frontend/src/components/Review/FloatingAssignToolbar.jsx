import React from 'react';
import { createPortal } from 'react-dom';
import { Button, Select, Space } from 'antd';
import useJobStore from '../../store/jobStore';
import useConfigStore from '../../store/configStore';

const FloatingAssignToolbar = ({ jobId, pages = [] }) => {
  const selectedPages = useJobStore((s) => s.selectedPages[jobId] || new Set());
  const patchPages = useJobStore((s) => s.patchPages);
  const clearSelection = useJobStore((s) => s.clearSelection);
  const documentTypes = useConfigStore((s) => s.documentTypes);
  const [selectedType, setSelectedType] = React.useState(null);

  if (selectedPages.size === 0) return null;

  const selectedPagesData = pages.filter(p => selectedPages.has(p.page_number));
  const allHaveType = selectedPagesData.every(p => p.document_type_id != null);

  const handleApply = async () => {
    const docTypeId = selectedType === '__undetected__' ? null : selectedType;
    const assignments = Array.from(selectedPages).map((pageNum) => ({ page_number: pageNum, document_type_id: docTypeId }));
    await patchPages(jobId, assignments);
    setSelectedType(null);
  };

  const handleConfirmCorrect = async () => {
    const pageNumbers = Array.from(selectedPages);
    await import('../../api/jobsApi').then(({ clearPageErrors }) => clearPageErrors(jobId, pageNumbers));
    clearSelection(jobId);
  };

  const handleCancel = () => { clearSelection(jobId); setSelectedType(null); };

  return createPortal(
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      background: 'var(--bg-card)',
      borderTop: '1px solid var(--border)',
      boxShadow: '0 -4px 24px rgba(0,0,0,0.3)',
      zIndex: 1060,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '14px 20px',
      gap: 14,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
        maxWidth: 1400, width: '100%', justifyContent: 'center',
      }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontWeight: 600, fontSize: 14, color: 'var(--accent)',
          background: 'var(--accent-bg)', padding: '4px 14px', borderRadius: 6,
          border: '1px solid var(--accent-border)',
        }}>
          {selectedPages.size} стр.
        </span>
        <Select
          style={{ width: 240 }}
          placeholder="Назначить тип..."
          allowClear
          value={selectedType}
          onChange={setSelectedType}
          options={[
            ...documentTypes.map((dt) => ({ label: dt.name, value: dt.id })),
            { label: 'Не распознан', value: '__undetected__' },
          ]}
        />
        <Space>
          <Button type="primary" onClick={handleApply} disabled={!selectedType} style={{ borderRadius: 6, height: 36, padding: '4px 20px' }}>
            Применить
          </Button>
          <Button onClick={handleCancel} style={{ borderRadius: 6, height: 36, padding: '4px 20px' }}>
            Отмена
          </Button>
        </Space>
        <div style={{ width: 1, height: 24, background: 'var(--border)' }} />
        <Button
          type="primary"
          onClick={handleConfirmCorrect}
          disabled={!allHaveType}
          style={{
            borderRadius: 6, height: 36, padding: '4px 20px',
            background: allHaveType ? '#2ea86b' : undefined,
            borderColor: allHaveType ? '#2ea86b' : undefined,
          }}
        >
          Подтвердить корректность
        </Button>
      </div>
    </div>,
    document.body,
  );
};

export default FloatingAssignToolbar;
