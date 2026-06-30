import React, { useEffect, useState, useMemo } from 'react';
import { Card, Row, Col, Button, Tooltip, Space, Select, Input, Modal, App } from 'antd';
import {
  ExclamationCircleOutlined, CheckCircleOutlined, CloseCircleOutlined,
  EyeOutlined, SearchOutlined, DeleteOutlined,
} from '@ant-design/icons';
import useJobStore from '../../store/jobStore';
import useProjectStore from '../../store/projectStore';
import DossierModal from './DossierModal';

const getStageLabel = (stage) => {
  const map = {
    text_layer: 'Анализ текста',
    ocr_cv: 'OCR + CV',
    vlm: 'Визуальная модель',
    assembling: 'Склейка PDF',
  };
  return map[stage] || stage;
};

const getJobColor = (job) => {
  if (job.status === 'running') return { strip: '#4a9eff', label: job.processing_stage ? `${getStageLabel(job.processing_stage)}…` : 'Обрабатывается' };
  if (job.status === 'pending') return { strip: '#9ca0a8', label: 'В ожидании' };
  if (job.status === 'done') return { strip: '#2ea86b', label: 'Корректно' };
  if (job.status === 'needs_review') return { strip: '#d4943a', label: 'На проверке' };
  return { strip: '#d13a3a', label: 'Не распознано' };
};

const FILTERS = [
  { key: 'all', label: 'Все', color: 'var(--text-secondary)' },
  { key: 'errors', label: 'Нужна проверка', color: '#d4943a' },
  { key: 'failed', label: 'Ошибка', color: '#d13a3a' },
  { key: 'ok', label: 'Корректные', color: '#2ea86b' },
  { key: 'processing', label: 'В обработке', color: '#7a818a' },
];

const ReviewPage = () => {
  const { reviewJobs, fetchReviewJobs, deleteJob, deleteBatch, openPdfViewer } = useJobStore();
  const projects = useProjectStore((s) => s.projects);
  const [apiModal, apiModalCtx] = Modal.useModal();
  const [filterTab, setFilterTab] = useState('all');
  const [filterProjectId, setFilterProjectId] = useState(null);
  const [filterBatchId, setFilterBatchId] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [dossierModal, setDossierModal] = useState({ open: false, job: null });

  useEffect(() => {
    fetchReviewJobs(filterProjectId);
  }, [fetchReviewJobs, filterProjectId]);

  const allJobs = [
    ...(reviewJobs.needs_review || []),
    ...(reviewJobs.done || []),
    ...(reviewJobs.failed || []),
    ...(reviewJobs.in_progress || []),
  ];

  const batchOptions = useMemo(() => {
    const map = new Map();
    allJobs.forEach(j => {
      const bid = j.batch_id ? String(j.batch_id) : j.job_id;
      if (!map.has(bid)) {
        const batchJobs = allJobs.filter(aj => (aj.batch_id ? String(aj.batch_id) : aj.job_id) === bid);
        const projName = projects.find(p => String(p.id) === String(j.project_id))?.name || '';
        const date = new Date(j.created_at);
        const dateStr = `${date.getDate().toString().padStart(2,'0')}.${(date.getMonth()+1).toString().padStart(2,'0')}.${date.getFullYear()}`;
        const label = batchJobs.length > 1
          ? `${projName || 'Без проекта'} ${dateStr} (${batchJobs.length} PDF)`
          : j.source_filename;
        map.set(bid, { value: bid, label });
      }
    });
    return Array.from(map.values());
  }, [allJobs, projects]);

  const filteredByProject = useMemo(() => {
    if (!filterProjectId) return allJobs;
    return allJobs.filter(j => String(j.project_id) === String(filterProjectId));
  }, [allJobs, filterProjectId]);

  const filteredByBatch = useMemo(() => {
    if (!filterBatchId) return filteredByProject;
    return filteredByProject.filter(j => (j.batch_id ? String(j.batch_id) : j.job_id) === filterBatchId);
  }, [filteredByProject, filterBatchId]);

  const filteredBySearch = useMemo(() => {
    if (!searchText) return filteredByBatch;
    const q = searchText.toLowerCase();
    return filteredByBatch.filter(j => j.source_filename.toLowerCase().includes(q));
  }, [filteredByBatch, searchText]);

  const countByFilter = useMemo(() => {
    const all = filteredBySearch.length;
    const errors = filteredBySearch.filter(j => j.status === 'needs_review').length;
    const failed = filteredBySearch.filter(j => j.status === 'failed').length;
    const ok = filteredBySearch.filter(j => j.status === 'done').length;
    const processing = filteredBySearch.filter(j => j.status === 'running' || j.status === 'pending').length;
    return { all, errors, failed, ok, processing };
  }, [filteredBySearch]);

  const filteredJobs = (() => {
    let jobs = filteredBySearch;
    if (filterTab === 'errors') jobs = jobs.filter(j => j.status === 'needs_review');
    if (filterTab === 'failed') jobs = jobs.filter(j => j.status === 'failed');
    if (filterTab === 'ok') jobs = jobs.filter(j => j.status === 'done');
    if (filterTab === 'processing') jobs = jobs.filter(j => j.status === 'running' || j.status === 'pending');
    return [...jobs].sort((a, b) => {
      const order = { running: 0, pending: 1, needs_review: 2, failed: 3, done: 4 };
      return (order[a.status] ?? 9) - (order[b.status] ?? 9);
    });
  })();

  const handleDelete = (job) => {
    apiModal.confirm({
      title: 'Удалить загрузку?',
      content: `Удалить "${job.source_filename}"?`,
      okText: 'Удалить',
      cancelText: 'Отмена',
      okButtonProps: { danger: true },
      onOk: () => deleteJob(job.job_id),
    });
  };

  const handleDeleteBatch = () => {
    const batchInfo = batchOptions.find(b => b.value === filterBatchId);
    const label = batchInfo?.label || 'выбранную загрузку';
    const batchJobs = allJobs.filter(j => (j.batch_id ? String(j.batch_id) : j.job_id) === filterBatchId);
    apiModal.confirm({
      title: 'Удалить всю загрузку?',
      content: (
        <div>
          <div style={{ marginBottom: 8 }}>Вы уверены, что хотите удалить <b>{label}</b>?</div>
          <div style={{ color: '#d13a3a', fontWeight: 600 }}>{batchJobs.length} досье будет удалено безвозвратно.</div>
        </div>
      ),
      okText: 'Удалить всё',
      cancelText: 'Отмена',
      okButtonProps: { danger: true },
      onOk: () => deleteBatch(filterBatchId),
    });
  };

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {[
          { label: 'Требуют проверки', value: countByFilter.errors, icon: <ExclamationCircleOutlined />, color: '#d4943a' },
          { label: 'Готово', value: countByFilter.ok, icon: <CheckCircleOutlined />, color: 'var(--accent)' },
          { label: 'Ошибки', value: countByFilter.failed, icon: <CloseCircleOutlined />, color: '#d13a3a' },
          { label: 'Найдено', value: filteredBySearch.length, icon: <div style={{ fontSize: 18, fontWeight: 700, lineHeight: '22px' }}>∑</div>, color: 'var(--text-secondary)' },
        ].map((item) => (
          <Col key={item.label} xs={12} sm={6}>
            <Card style={{ borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-card)' }} styles={{ body: { padding: '16px 20px' } }}>
              <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 8 }}>{item.label}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: item.color, fontSize: 22, display: 'flex', alignItems: 'center' }}>{item.icon}</span>
                <span style={{ color: 'var(--text)', fontSize: 28, fontWeight: 700, lineHeight: 1 }}>{item.value}</span>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <div style={{
        background: 'var(--bg-card)', borderRadius: 10, border: '1px solid var(--border)',
        padding: '12px 16px', marginBottom: 24,
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)', whiteSpace: 'nowrap' }}>Фильтры</span>
        <Select
          style={{ width: 280, flexShrink: 0 }}
          placeholder="Все проекты"
          value={filterProjectId}
          onChange={(v) => { setFilterProjectId(v); setFilterBatchId(null); }}
          allowClear
          options={projects.map((p) => ({ value: p.id, label: p.name }))}
        />
        <Select
          style={{ width: 280, flexShrink: 0 }}
          placeholder="Все загрузки"
          value={filterBatchId}
          onChange={(v) => setFilterBatchId(v)}
          allowClear
          options={batchOptions}
          showSearch
          optionFilterProp="label"
        />
        <Input
          style={{ minWidth: 100, flex: 1 }}
          placeholder="Поиск по названию..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          prefix={<SearchOutlined style={{ color: 'var(--text-tertiary)' }} />}
          allowClear
        />
        {filterBatchId && (
          <Tooltip title="Удалить все досье этой загрузки">
            <Button danger icon={<DeleteOutlined />} onClick={handleDeleteBatch} style={{ borderRadius: 6, flexShrink: 0 }}>
              Удалить загрузку
            </Button>
          </Tooltip>
        )}
      </div>

      <div style={{ background: 'var(--bg-card)', borderRadius: 10, border: '1px solid var(--border)' }}>
        <div style={{
          padding: '16px 24px', borderBottom: '1px solid var(--border)',
          background: 'var(--bg-card)', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)' }}>Досье</span>
          <Space size={6}>
            {FILTERS.map(f => {
              const active = filterTab === f.key;
              return (
                <Button
                  key={f.key}
                  size="small"
                  onClick={() => setFilterTab(f.key)}
                  style={{
                    borderRadius: 6, fontSize: 12, fontWeight: active ? 700 : 500,
                    border: active ? `1.5px solid ${f.color}` : '1px solid var(--border)',
                    color: active ? f.color : 'var(--text-secondary)',
                    background: active ? (f.color + '18') : 'var(--bg-elevated)',
                  }}
                >
                  {f.label} <span style={{ marginLeft: 4, opacity: 0.7 }}>({countByFilter[f.key]})</span>
                </Button>
              );
            })}
          </Space>
        </div>

        <div style={{ padding: '16px' }}>
          {filteredJobs.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>
              <CheckCircleOutlined style={{ fontSize: 32, color: 'var(--accent)', marginBottom: 8 }} />
              <div style={{ color: 'var(--text-secondary)' }}>Нет досье</div>
            </div>
          ) : (
            <Row gutter={[12, 12]}>
              {filteredJobs.map((job) => {
                const jid = job.job_id;
                const color = getJobColor(job);

                return (
                  <Col key={jid} xs={24} sm={12} md={8} lg={6}>
                    <Card
                      size="small"
                      hoverable
                      onClick={() => {
                        if (job.project_id) setFilterProjectId(job.project_id);
                        setDossierModal({ open: true, job });
                      }}
                      style={{
                        borderRadius: 8, overflow: 'hidden', cursor: 'pointer',
                        border: '1px solid var(--border)', background: 'var(--bg-card)', height: '100%',
                      }}
                      styles={{ body: { padding: '12px 16px' } }}
                    >
                      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 5, background: color.strip }} />
                      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', paddingTop: 4 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {job.source_filename}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2, marginBottom: 10 }}>
                          {job.total_pages || '?'} стр · {color.label}
                        </div>
                        <div style={{ marginTop: 'auto', display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                          <Tooltip title="Открыть исходный PDF">
                            <Button size="small" icon={<EyeOutlined />}
                              onClick={(e) => { e.stopPropagation(); openPdfViewer(jid, job.source_filename); }}
                              style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 8px', background: 'var(--bg-elevated)' }} />
                          </Tooltip>
                          <Tooltip title="Удалить загрузку">
                            <Button size="small" danger icon={<DeleteOutlined />}
                              onClick={(e) => { e.stopPropagation(); handleDelete(job); }}
                              style={{ borderRadius: 6, padding: '2px 8px' }} />
                          </Tooltip>
                        </div>
                      </div>
                    </Card>
                  </Col>
                );
              })}
            </Row>
          )}
        </div>
      </div>

      <DossierModal
        open={dossierModal.open}
        job={dossierModal.job}
        onClose={() => setDossierModal({ open: false, job: null })}
      />
      {apiModalCtx}
    </div>
  );
};

export default ReviewPage;
