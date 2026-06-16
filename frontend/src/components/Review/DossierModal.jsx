import React, { useEffect, useState } from 'react';
import { Modal, Button, Space, Select, Tooltip, Divider } from 'antd';
import {
  ExclamationCircleOutlined, CheckCircleOutlined,
  EyeOutlined, LeftOutlined, RightOutlined,
} from '@ant-design/icons';
import useJobStore from '../../store/jobStore';
import useConfigStore from '../../store/configStore';
import PageTile from './PageTile';

const getJobColor = (job) => {
  if (!job) return { header: '#2ea86b', label: 'Корректно' };
  if (job.status === 'failed') return { header: '#d13a3a', label: 'Ошибка' };
  if (job.error_pages > 0) return { header: '#d4943a', label: 'Частичные ошибки' };
  return { header: '#2ea86b', label: 'Корректно' };
};

const groupPagesByType = (pages) => {
  const groups = {};
  for (const p of pages) {
    const key = p.document_type_id || '__undetected__';
    if (!groups[key]) groups[key] = { typeId: p.document_type_id, typeName: p.document_type_name || 'Не распознан', pages: [] };
    groups[key].pages.push(p);
  }
  return Object.values(groups);
};

const DossierModal = ({ open, job, onClose }) => {
  const { selectedPages, togglePageSelection, patchPages, confirmJob, clearSelection } = useJobStore();
  const { documentTypes } = useConfigStore();
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [batchType, setBatchType] = useState(null);

  const [previewModal, setPreviewModal] = useState({ open: false, pageNum: null });
  const [previewType, setPreviewType] = useState(null);

  useEffect(() => {
    if (open && job) {
      setLoading(true);
      import('../../api/jobsApi').then(({ getJobPages }) =>
        getJobPages(job.job_id).then(res => {
          setPages(res.data);
          setLoading(false);
        }).catch(() => setLoading(false))
      );
    }
  }, [open, job]);

  const jid = job?.job_id;
  const color = getJobColor(job);
  const errorPages = pages.filter(p => p.error_code != null);
  const okPages = pages.filter(p => p.error_code == null);
  const errorGroups = groupPagesByType(errorPages);
  const okGroups = groupPagesByType(okPages);
  const selectedSet = selectedPages[jid] || new Set();

  const previewIndex = previewModal.pageNum != null ? pages.findIndex(p => p.page_number === previewModal.pageNum) : -1;
  const previewPage = pages[previewIndex];
  const prevPage = pages[previewIndex - 1];
  const nextPage = pages[previewIndex + 1];

  const handlePreviewNav = (delta) => {
    const newIdx = previewIndex + delta;
    if (newIdx >= 0 && newIdx < pages.length) {
      const p = pages[newIdx];
      setPreviewType(p.document_type_id || null);
      setPreviewModal(prev => ({ ...prev, pageNum: p.page_number }));
    }
  };

  const handlePreviewTypeChange = async (newTypeId) => {
    if (!jid || previewModal.pageNum == null) return;
    await patchPages(jid, [{ page_number: previewModal.pageNum, document_type_id: newTypeId === '__undetected__' ? null : newTypeId }]);
    setPreviewType(newTypeId);
    setPages(prev => {
      const updated = [...prev];
      const idx = updated.findIndex(p => p.page_number === previewModal.pageNum);
      if (idx !== -1) {
        updated[idx] = { ...updated[idx], document_type_id: newTypeId === '__undetected__' ? null : newTypeId, manual_override: true };
      }
      return updated;
    });
  };

  const handleBatchApply = async () => {
    if (!jid || batchType == null) return;
    const docTypeId = batchType === '__undetected__' ? null : batchType;
    const assignments = Array.from(selectedSet).map(pn => ({ page_number: pn, document_type_id: docTypeId }));
    await patchPages(jid, assignments);
    setBatchType(null);
  };

  const handleBatchCancel = () => {
    clearSelection(jid);
    setBatchType(null);
  };

  const handleConfirm = () => {
    Modal.confirm({
      title: 'Подтвердить и склеить?', icon: null,
      content: <span style={{ color: 'var(--text-secondary)' }}>Создать итоговые PDF-файлы на основе текущего распределения страниц?</span>,
      okText: 'Подтвердить', onOk: () => confirmJob(jid),
    });
  };

  return (
    <>
      <Modal
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <Space size={12}>
              <span style={{ color: 'var(--text)', fontSize: 15, fontWeight: 600 }}>
                {job?.source_filename || ''}
              </span>
              <span style={{
                display: 'inline-block', padding: '2px 10px', borderRadius: 6,
                fontSize: 12, fontWeight: 600, color: '#fff', background: color.header,
              }}>
                {pages.length} стр · {color.label}
              </span>
              <Tooltip title="Открыть исходный PDF">
                <Button size="small" icon={<EyeOutlined />}
                  href={jid ? `/api/jobs/${jid}/source` : '#'} target="_blank"
                  style={{ color: 'var(--text-secondary)', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6, padding: '2px 12px', background: 'var(--bg-elevated)' }}>
                  Открыть исходный PDF
                </Button>
              </Tooltip>
            </Space>
            <Space>
              {job?.status !== 'done' && (
                <Button size="small" type="primary" onClick={handleConfirm}
                  style={{ borderRadius: 6, fontSize: 13 }}>
                  Подтвердить и склеить
                </Button>
              )}
            </Space>
          </div>
        }
        open={open}
        onCancel={onClose}
        footer={null}
        width={1400}
        styles={{ body: { padding: 0 } }}
      >
        <div style={{ padding: '20px 24px', maxHeight: 'calc(80vh - 130px)', overflowY: 'auto' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-tertiary)', fontSize: 15 }}>Загрузка...</div>
          ) : (
            <div>
              {errorPages.length > 0 && (
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#d13a3a', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ExclamationCircleOutlined /> Страницы с ошибками ({errorPages.length})
                  </div>
                  {errorGroups.map((group) => (
                    <div key={group.typeId} style={{ marginBottom: 20 }}>
                      <div style={{ display: 'flex', gap: 18, overflowX: 'auto', padding: '6px 10px 6px', minHeight: 220 }}>
                        {group.pages.map((page) => (
                          <PageTile key={page.page_number} jobId={jid} page={page}
                            isSelected={selectedSet.has(page.page_number)}
                            onToggleSelect={(pn) => togglePageSelection(jid, pn)}
                            onClickPreview={(pn) => {
                              setPreviewType(page.document_type_id || null);
                              setPreviewModal({ open: true, pageNum: pn });
                            }} />
                        ))}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-tertiary)', marginTop: 10, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                        {group.typeName} · {group.pages.length} стр.
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {errorPages.length > 0 && okPages.length > 0 && (
                <Divider style={{ borderColor: 'var(--border)', margin: '20px 0' }} />
              )}
              {okPages.length > 0 && (
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <CheckCircleOutlined /> Корректные страницы ({okPages.length})
                  </div>
                  {okGroups.map((group) => (
                    <div key={group.typeId} style={{ marginBottom: 20 }}>
                      <div style={{ display: 'flex', gap: 18, overflowX: 'auto', padding: '6px 10px 6px', minHeight: 220 }}>
                        {group.pages.map((page) => (
                          <PageTile key={page.page_number} jobId={jid} page={page}
                            isSelected={selectedSet.has(page.page_number)}
                            onToggleSelect={(pn) => togglePageSelection(jid, pn)}
                            onClickPreview={(pn) => {
                              setPreviewType(page.document_type_id || null);
                              setPreviewModal({ open: true, pageNum: pn });
                            }} />
                        ))}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-tertiary)', marginTop: 10, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                        {group.typeName} · {group.pages.length} стр.
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {pages.length === 0 && !loading && (
                <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-tertiary)', fontSize: 15 }}>Нет данных о страницах</div>
              )}
            </div>
          )}
        </div>
      </Modal>

      <style>{`
        .batch-select .ant-select-selection-placeholder { color: var(--text-tertiary) !important; opacity: 1 !important; }
        .batch-select .ant-select-selector { background: var(--bg-elevated) !important; border-color: var(--border) !important; }
        .batch-select .ant-select-selection-placeholder,
        .batch-select .ant-select-selection-item { color: var(--text) !important; }
      `}</style>
      {selectedSet.size > 0 && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 1050,
          background: 'var(--bg-card)', borderRadius: 10,
          boxShadow: '0 4px 24px rgba(0,0,0,0.4)', border: '1px solid var(--border)',
          padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', justifyContent: 'center',
        }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontWeight: 600, fontSize: 14, color: 'var(--accent)',
            background: 'var(--accent-bg)', padding: '4px 14px', borderRadius: 6,
            border: '1px solid var(--accent-border)',
          }}>
            {selectedSet.size} стр.
          </span>
          <Select
            className="batch-select"
            style={{ width: 240 }}
            placeholder="Назначить тип..."
            allowClear
            value={batchType}
            onChange={setBatchType}
            options={[
              ...documentTypes.map((dt) => ({ label: dt.name, value: dt.id })),
              { label: 'Не распознан', value: '__undetected__' },
            ]}
          />
          <Space>
            <Button type="primary" onClick={handleBatchApply} disabled={!batchType} style={{ borderRadius: 6 }}>
              Применить
            </Button>
            <Button onClick={handleBatchCancel} style={{ borderRadius: 6 }}>Отмена</Button>
          </Space>
        </div>
      )}

      <Modal
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text)' }}>
            <Space>
              <Button type="text" size="small" icon={<LeftOutlined />}
                disabled={!prevPage} onClick={() => handlePreviewNav(-1)}
                style={{ color: prevPage ? 'var(--accent)' : 'var(--text-tertiary)' }} />
              <Button type="text" size="small" icon={<RightOutlined />}
                disabled={!nextPage} onClick={() => handlePreviewNav(1)}
                style={{ color: nextPage ? 'var(--accent)' : 'var(--text-tertiary)' }} />
              <span style={{ fontSize: 14 }}>
                {previewPage
                  ? `${previewPage.document_type_name || 'Страница'} - ${(previewModal.pageNum ?? 0) + 1}/${pages.length}`
                  : `Страница ${(previewModal.pageNum ?? 0) + 1}`}
              </span>
              <Tooltip title="Открыть исходный PDF">
                <Button size="small" icon={<EyeOutlined />}
                  href={jid ? `/api/jobs/${jid}/source` : '#'} target="_blank"
                  style={{ color: 'var(--text-secondary)', fontSize: 13, marginLeft: 8, border: '1px solid var(--border)', borderRadius: 6, padding: '2px 12px', background: 'var(--bg-elevated)' }}>
                  Открыть исходный PDF
                </Button>
              </Tooltip>
            </Space>
          </div>
        }
        open={previewModal.open}
        onCancel={() => setPreviewModal({ open: false, pageNum: null })}
        footer={null}
        width={1000}
        styles={{ body: { padding: 0 } }}
      >
        {jid && previewModal.pageNum != null && (
          <div>
            <img src={`/api/jobs/${jid}/page/${previewModal.pageNum}/preview`}
              alt={`Page ${previewModal.pageNum}`} style={{ width: '100%', display: 'block' }} />
            <div style={{
              padding: '14px 24px', borderTop: '1px solid var(--border)',
              background: 'var(--bg-card)', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <Space size={24}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Метод</div>
                  <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 500 }}>
                    {previewPage?.detection_method || '—'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Уверенность</div>
                  <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 500 }}>
                    {previewPage?.confidence != null ? `${(previewPage.confidence * 100).toFixed(0)}%` : '—'}
                  </div>
                </div>
                {previewPage?.error_code && (
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Ошибка</div>
                    <div style={{ fontSize: 14, color: '#d13a3a', fontWeight: 500 }}>{previewPage.error_code}</div>
                  </div>
                )}
              </Space>
              <Space>
                <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Тип:</span>
                <Select
                  style={{ width: 220 }}
                  value={previewType === null ? '__undetected__' : previewType}
                  onChange={handlePreviewTypeChange}
                  options={[
                    ...documentTypes.map(dt => ({ label: dt.name, value: dt.id })),
                    { label: 'Не распознан', value: '__undetected__' },
                  ]}
                />
              </Space>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
};

export default DossierModal;
