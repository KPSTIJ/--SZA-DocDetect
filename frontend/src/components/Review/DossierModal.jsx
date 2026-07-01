import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Modal, Button, Space, Select, Tooltip, Divider, App, Collapse, Checkbox } from 'antd';
import {
  ExclamationCircleOutlined, CheckCircleOutlined,
  EyeOutlined, LeftOutlined, RightOutlined, DownloadOutlined, DownOutlined,
} from '@ant-design/icons';
import useJobStore from '../../store/jobStore';
import client from '../../api/client';
import PageTile from './PageTile';

const getStageLabel = (stage) => {
  const map = { text_layer: 'Анализ текста', ocr_cv: 'OCR+CV', vlm: 'Визуальная модель', assembling: 'Склейка PDF' };
  return map[stage] || stage;
};

const getJobColor = (job) => {
  if (!job) return { header: '#2ea86b', label: 'Корректно' };
  if (job.status === 'running') return { header: '#4a9eff', label: job.processing_stage ? `${getStageLabel(job.processing_stage)}…` : 'Обрабатывается' };
  if (job.status === 'pending') return { header: '#9ca0a8', label: 'В ожидании' };
  if (job.status === 'done') return { header: '#2ea86b', label: 'Корректно' };
  if (job.status === 'needs_review') return { header: '#d4943a', label: 'На проверке' };
  return { header: '#d13a3a', label: 'Не распознано' };
};

const groupPagesByType = (pages) => {
  const segments = [];
  let current = null;
  for (const p of pages) {
    if (current && current.typeId === p.document_type_id) {
      if (p.is_title_page && current.pages.length > 0) {
        segments.push(current);
        current = { typeId: p.document_type_id, typeName: p.document_type_name || 'Не распознан', pages: [p] };
      } else {
        current.pages.push(p);
      }
    } else {
      if (current) segments.push(current);
      current = { typeId: p.document_type_id, typeName: p.document_type_name || 'Не распознан', pages: [p] };
    }
  }
  if (current) segments.push(current);
  const counts = {};
  segments.forEach(g => {
    if (g.typeId != null) {
      counts[g.typeId] = (counts[g.typeId] || 0) + 1;
      g.occurrence = counts[g.typeId];
    }
  });
  return segments;
};

const DossierModal = ({ open, job, onClose, jobs = [], onNavigate }) => {
  const { selectedPages, togglePageSelection, patchPages, confirmJob, clearSelection, openPdfViewer } = useJobStore();
  const [apiModal, apiModalCtx] = Modal.useModal();
  const [documentTypes, setDocumentTypes] = useState([]);
  const [pages, setPages] = useState([]);
  const [outputDocs, setOutputDocs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [batchType, setBatchType] = useState(null);

  const [previewModal, setPreviewModal] = useState({ open: false, pageNum: null });
  const [previewType, setPreviewType] = useState(null);
  const pagesCache = useRef({});
  const cacheOrder = useRef([]);

  const currentIndex = jobs.findIndex(j => j.job_id === job?.job_id);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < jobs.length - 1;

  const goPrev = () => { if (hasPrev && onNavigate) onNavigate(jobs[currentIndex - 1]); };
  const goNext = () => { if (hasNext && onNavigate) onNavigate(jobs[currentIndex + 1]); };

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === 'ArrowLeft' && !previewModal.open) {
        e.preventDefault();
        const idx = jobs.findIndex(j => j.job_id === job?.job_id);
        if (idx > 0 && onNavigate) onNavigate(jobs[idx - 1]);
      }
      if (e.key === 'ArrowRight' && !previewModal.open) {
        e.preventDefault();
        const idx = jobs.findIndex(j => j.job_id === job?.job_id);
        if (idx < jobs.length - 1 && onNavigate) onNavigate(jobs[idx + 1]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, jobs, job, onNavigate, previewModal.open]);



  const setCache = (jid, data) => {
    pagesCache.current[jid] = data;
    cacheOrder.current = cacheOrder.current.filter(id => id !== jid);
    cacheOrder.current.push(jid);
    if (cacheOrder.current.length > 10) {
      const oldest = cacheOrder.current.shift();
      delete pagesCache.current[oldest];
    }
  };

  const loadPages = useCallback((forceRefresh = false) => {
    if (!open || !job) return;
    const jid = job.job_id;
    if (!forceRefresh && pagesCache.current[jid]) {
      setPages(pagesCache.current[jid]);
      return;
    }
    setLoading(true);
    import('../../api/jobsApi').then(({ getJobPages }) =>
      getJobPages(jid).then(res => {
        setCache(jid, res.data);
        setPages(res.data);
        setLoading(false);
      }).catch(() => setLoading(false))
    );
    const idx = jobs.findIndex(j => j.job_id === jid);
    [idx - 1, idx + 1].forEach(i => {
      if (i >= 0 && i < jobs.length) {
        const nextId = jobs[i].job_id;
        if (!pagesCache.current[nextId]) {
          import('../../api/jobsApi').then(({ getJobPages }) =>
            getJobPages(nextId).then(res => setCache(nextId, res.data)).catch(() => {})
          );
        }
      }
    });
  }, [open, job, jobs]);

  useEffect(() => {
    if (open && job) {
      loadPages();
      import('../../api/jobsApi').then(({ getJobDetail }) =>
        getJobDetail(job.job_id).then(res => setOutputDocs(res.data?.output_documents || []))
      );
      import('../../api/configApi').then(({ getDocumentTypes }) =>
        getDocumentTypes(job.project_id || undefined).then(res => setDocumentTypes(res.data))
      );
    }
  }, [open, job, loadPages]);

  const jid = job?.job_id;
  const color = getJobColor(job);
  const errorPages = pages.filter(p => p.error_code != null);
  const okPages = pages.filter(p => p.error_code == null);
  const errorGroups = groupPagesByType(errorPages);
  const okGroups = groupPagesByType(okPages);
  const selectedSet = selectedPages[jid] || new Set();
  const selectedPagesData = pages.filter(p => selectedSet.has(p.page_number));
  const allPagesCorrect = pages.length > 0 && pages.every(p => p.error_code == null && p.document_type_id != null);

  const previewIndex = previewModal.pageNum != null ? pages.findIndex(p => p.page_number === previewModal.pageNum) : -1;
  const previewPage = pages[previewIndex];
  const prevPage = pages[previewIndex - 1];
  const nextPage = pages[previewIndex + 1];

  const previewNavRef = useRef((_) => {});
  const handlePreviewNav = (delta) => {
    const newIdx = previewIndex + delta;
    if (newIdx >= 0 && newIdx < pages.length) {
      const p = pages[newIdx];
      setPreviewType(p.document_type_id || null);
      setPreviewModal(prev => ({ ...prev, pageNum: p.page_number }));
    }
  };
  previewNavRef.current = handlePreviewNav;

  useEffect(() => {
    if (!previewModal.open) return;
    const handler = (e) => {
      if (e.key === 'ArrowUp') { e.preventDefault(); previewNavRef.current(-1); }
      if (e.key === 'ArrowDown') { e.preventDefault(); previewNavRef.current(1); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [previewModal.open]);

  const handleWheel = useCallback((e) => {
    if (e.deltaY < 0) previewNavRef.current(-1);
    if (e.deltaY > 0) previewNavRef.current(1);
  }, []);

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
    delete pagesCache.current[jid];
    await patchPages(jid, assignments);
    clearSelection(jid);
    setBatchType(null);
    loadPages(true);
  };

  const handleBatchCancel = () => {
    clearSelection(jid);
    setBatchType(null);
  };

  const handleSelectGroup = (group, checked) => {
    useJobStore.setState(state => {
      const current = new Set(state.selectedPages[jid] || []);
      group.pages.forEach(p => {
        if (checked) current.add(p.page_number);
        else current.delete(p.page_number);
      });
      return { selectedPages: { ...state.selectedPages, [jid]: current } };
    });
  };

  const isGroupFullySelected = (group) => {
    return group.pages.length > 0 && group.pages.every(p => selectedSet.has(p.page_number));
  };

  const isGroupPartiallySelected = (group) => {
    return group.pages.some(p => selectedSet.has(p.page_number)) && !isGroupFullySelected(group);
  };

  const handleConfirm = () => {
    apiModal.confirm({
      title: 'Подтвердить и склеить?', icon: null,
      content: <span style={{ color: 'var(--text-secondary)' }}>Создать итоговые PDF-файлы на основе текущего распределения страниц?</span>,
      okText: 'Подтвердить',
      onOk: async () => {
        await confirmJob(jid);
        onClose();
      },
    });
  };

  return (
    <>
      <Modal
        title={<div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
          <Button size="small" disabled={!hasPrev} onClick={goPrev}
            style={{
              borderRadius: 4, padding: '0 8px', fontSize: 14, lineHeight: '24px', fontWeight: 700,
              border: '1px solid var(--border)', background: hasPrev ? 'var(--bg-elevated)' : 'transparent',
              color: hasPrev ? 'var(--text)' : '#555', opacity: hasPrev ? 1 : 0.35,
            }}>
            <LeftOutlined />
          </Button>
          <Button size="small" disabled={!hasNext} onClick={goNext}
            style={{
              borderRadius: 4, padding: '0 8px', fontSize: 14, lineHeight: '24px', fontWeight: 700,
              border: '1px solid var(--border)', background: hasNext ? 'var(--bg-elevated)' : 'transparent',
              color: hasNext ? 'var(--text)' : '#555', opacity: hasNext ? 1 : 0.35,
            }}>
            <RightOutlined />
          </Button>
          <span style={{ color: 'var(--text)', fontSize: 15, fontWeight: 600 }}>{job?.source_filename || ''}</span>
          <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, color: '#fff', background: color.header, whiteSpace: 'nowrap' }}>
            {pages.length} стр · {color.label}
          </span>
          <Tooltip title="Открыть исходный PDF">
            <Button size="small" icon={<EyeOutlined />}
              onClick={() => { if (jid) openPdfViewer(jid, job?.source_filename); }}
              style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-elevated)', fontSize: 13, padding: '2px 8px' }} />
          </Tooltip>
          <div style={{ flex: 1 }} />
          <Button size="small" type="primary" onClick={handleConfirm}
            disabled={!allPagesCorrect}
            style={{ borderRadius: 6, fontSize: 13, marginRight: 28, border: '1.5px solid var(--accent-border)' }}>
            Подтвердить разрезание
          </Button>
        </div>}
        closeIcon={<span style={{ fontSize: 16, color: 'var(--text-tertiary)', cursor: 'pointer', userSelect: 'none' }}>✕</span>}
        open={open}
        onCancel={onClose}
        footer={null}
        width={1400}
        styles={{ body: { padding: 0 } }}
        className="dossier-modal"
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
                  {errorGroups.map((group, gi) => (
                    <React.Fragment key={group.typeId != null ? `${group.typeId}-${group.occurrence}` : `undetected-${gi}`}>
                      {gi > 0 && <div style={{ height: 1, background: 'var(--border)', margin: '16px 10px' }} />}
                      <div style={{ marginBottom: gi === errorGroups.length - 1 ? 0 : 20 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#d13a3a', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.3px', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Checkbox
                            checked={isGroupFullySelected(group)}
                            indeterminate={isGroupPartiallySelected(group)}
                            onChange={e => handleSelectGroup(group, e.target.checked)}
                            style={{ marginRight: 4 }}
                          />
                          <span style={{ cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => handleSelectGroup(group, !isGroupFullySelected(group))}>
                            {group.typeId != null && <span style={{ fontSize: 13, fontWeight: 700, color: '#d13a3a' }}>№{group.occurrence}</span>}
                            <span>{group.typeName}</span>
                            <span style={{ fontWeight: 400, opacity: 0.75, marginLeft: 4 }}>· {group.pages.length} стр.</span>
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: 20, overflowX: 'auto', padding: '8px 10px 12px', minHeight: 226 }}>
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
                      </div>
                    </React.Fragment>
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
                  {okGroups.map((group, gi) => (
                    <React.Fragment key={group.typeId != null ? `${group.typeId}-${group.occurrence}` : `ok-${gi}`}>
                      {gi > 0 && <div style={{ height: 1, background: 'var(--border)', margin: '16px 10px' }} />}
                      <div style={{ marginBottom: gi === okGroups.length - 1 ? 0 : 20 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.3px', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Checkbox
                            checked={isGroupFullySelected(group)}
                            indeterminate={isGroupPartiallySelected(group)}
                            onChange={e => handleSelectGroup(group, e.target.checked)}
                            style={{ marginRight: 4 }}
                          />
                          <span style={{ cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => handleSelectGroup(group, !isGroupFullySelected(group))}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>№{group.occurrence}</span>
                            <span>{group.typeName}</span>
                            <span style={{ fontWeight: 400, opacity: 0.75, marginLeft: 4 }}>· {group.pages.length} стр.</span>
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: 20, overflowX: 'auto', padding: '8px 10px 12px', minHeight: 226 }}>
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
                      </div>
                    </React.Fragment>
                  ))}
                </div>
              )}
              {pages.length === 0 && !loading && (
                <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-tertiary)', fontSize: 15 }}>Нет данных о страницах</div>
              )}
            </div>
          )}
          {outputDocs.length > 0 && (
            <div style={{ marginTop: pages.length > 0 ? 20 : 0, padding: '0 24px 20px' }}>
              <Divider style={{ borderColor: 'var(--border)', marginBottom: 16 }} />
              <Collapse
                ghost
                defaultActiveKey={[]}
                expandIcon={({ isActive }) => <DownOutlined rotate={isActive ? 180 : 0} style={{ fontSize: 12 }} />}
                style={{ background: 'transparent' }}
                items={[{
                  key: 'output',
                  label: (
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <DownloadOutlined /> Итоговые документы ({outputDocs.length})
                    </span>
                  ),
                  children: (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                      {outputDocs.map((doc) => (
                        <div key={doc.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>
                              №{doc.occurrence_index} / {doc.document_type_name || doc.document_type_id}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
                              Стр. {doc.start_page + 1}–{doc.end_page + 1} · {doc.page_count} стр.
                            </div>
                          </div>
                          <Tooltip title="Скачать PDF">
                            <Button size="small" icon={<DownloadOutlined />}
                              href={`${client.defaults.baseURL}/jobs/${jid}/output/${doc.id}`}
                              target="_blank"
                              style={{ color: 'var(--accent)', border: '1px solid var(--accent-border)', borderRadius: 6 }}
                            />
                          </Tooltip>
                        </div>
                      ))}
                    </div>
                  ),
                }]}
              />
            </div>
          )}
        </div>
      </Modal>
      {apiModalCtx}

      <style>{`
        .batch-select .ant-select-selection-placeholder { color: var(--text-tertiary) !important; opacity: 1 !important; }
        .batch-select .ant-select-selector { background: var(--bg-elevated) !important; border-color: var(--border) !important; }
        .batch-select .ant-select-selection-placeholder,
        .batch-select .ant-select-selection-item { color: var(--text) !important; }
        .dossier-modal .ant-modal-close { top: 16px; }
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
          <div style={{ width: 1, height: 24, background: 'var(--border)' }} />
          <Button
            type="primary"
            onClick={async () => {
              const pageNumbers = Array.from(selectedSet);
              delete pagesCache.current[jid];
              await import('../../api/jobsApi').then(({ clearPageErrors }) => clearPageErrors(jid, pageNumbers));
              clearSelection(jid);
              loadPages(true);
            }}
            disabled={!selectedPagesData.every(p => p.document_type_id != null)}
            style={{
              borderRadius: 6,
              background: selectedPagesData.every(p => p.document_type_id != null) ? '#2ea86b' : undefined,
              borderColor: selectedPagesData.every(p => p.document_type_id != null) ? '#2ea86b' : undefined,
            }}
          >
            Подтвердить корректность
          </Button>
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
                  onClick={() => { if (jid) openPdfViewer(jid, job?.source_filename); }}
                  style={{ color: 'var(--accent)', fontSize: 13, marginLeft: 8, border: '1.5px solid var(--accent)', borderRadius: 6, padding: '2px 12px', background: 'var(--accent-bg)' }}>
                  Открыть исходный PDF
                </Button>
              </Tooltip>
            </Space>
          </div>
        }
        open={previewModal.open}
        onCancel={() => setPreviewModal({ open: false, pageNum: null })}
        footer={null}
        width={850}
        centered
        styles={{ body: { padding: 0 } }}
      >
        {jid && previewModal.pageNum != null && (
          <div onWheel={handleWheel}>
            <img src={`${client.defaults.baseURL}/jobs/${jid}/page/${previewModal.pageNum}/preview`}
              alt={`Page ${previewModal.pageNum}`}
              style={{ width: '100%', display: 'block', maxHeight: '80vh', objectFit: 'contain' }} />
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
