import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Button, Tooltip, Space } from 'antd';
import {
  ExclamationCircleOutlined, CheckCircleOutlined, CloseCircleOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import useJobStore from '../../store/jobStore';
import DossierModal from './DossierModal';

const getJobColor = (job) => {
  if (job.status === 'failed') return { strip: '#d13a3a', label: 'Ошибка' };
  if (job.error_pages > 0) return { strip: '#d4943a', label: 'Частичные ошибки' };
  return { strip: '#2ea86b', label: 'Корректно' };
};

const FILTERS = [
  { key: 'errors', label: 'Нужна проверка', color: '#d4943a' },
  { key: 'all', label: 'Все', color: 'var(--text-secondary)' },
  { key: 'failed', label: 'Ошибка', color: '#d13a3a' },
  { key: 'ok', label: 'Корректные', color: '#2ea86b' },
];

const ReviewPage = () => {
  const { reviewJobs, fetchReviewJobs, startPolling, stopPolling } = useJobStore();

  useEffect(() => {
    fetchReviewJobs();
    startPolling();
    return () => stopPolling();
  }, [fetchReviewJobs, startPolling, stopPolling]);

  const [filterTab, setFilterTab] = useState('errors');
  const [dossierModal, setDossierModal] = useState({ open: false, job: null });

  const allJobs = [
    ...(reviewJobs.needs_review || []),
    ...(reviewJobs.done || []),
    ...(reviewJobs.failed || []),
  ];

  const stats = {
    needs_review_count: allJobs.filter(j => j.error_pages > 0 && j.status !== 'failed').length,
    done_count: allJobs.filter(j => j.status === 'done' && (j.error_pages || 0) === 0).length,
    failed_count: allJobs.filter(j => j.status === 'failed').length,
    total_pages: allJobs.reduce((s, j) => s + (j.total_pages || 0), 0),
    total_error_pages: allJobs.reduce((s, j) => s + (j.error_pages || 0), 0),
  };

  const filteredJobs = filterTab === 'all' ? allJobs
    : filterTab === 'errors' ? allJobs.filter(j => j.error_pages > 0 && j.status !== 'failed')
    : filterTab === 'failed' ? allJobs.filter(j => j.status === 'failed')
    : filterTab === 'ok' ? allJobs.filter(j => j.status === 'done' && (j.error_pages || 0) === 0)
    : allJobs;

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {[
          { label: 'Требуют проверки', value: stats.needs_review_count, icon: <ExclamationCircleOutlined />, color: '#d4943a' },
          { label: 'Готово', value: stats.done_count, icon: <CheckCircleOutlined />, color: 'var(--accent)' },
          { label: 'Ошибки', value: stats.failed_count, icon: <CloseCircleOutlined />, color: '#d13a3a' },
          { label: 'Всего страниц', value: stats.total_pages, icon: <div style={{ fontSize: 18, fontWeight: 700, lineHeight: '22px' }}>Σ</div>, color: 'var(--text-secondary)' },
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

      <div style={{ background: 'var(--bg-card)', borderRadius: 10, border: '1px solid var(--border)' }}>
        <div style={{
          padding: '16px 24px', borderBottom: '1px solid var(--border)',
          background: 'var(--bg-card)', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <Space>
            <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)' }}>Досье</span>
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--accent-bg)', color: 'var(--accent)',
              borderRadius: 10, fontSize: 12, fontWeight: 700,
              padding: '2px 10px', lineHeight: '20px',
            }}>
              {filteredJobs.length}
            </span>
          </Space>
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
                  {f.label}
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
                      onClick={() => setDossierModal({ open: true, job })}
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
                        <div style={{ marginTop: 'auto' }} onClick={e => e.stopPropagation()}>
                          <Tooltip title="Открыть исходный PDF">
                            <Button size="small" icon={<EyeOutlined />}
                              href={`/api/jobs/${jid}/source`} target="_blank"
                              style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 8px', background: 'var(--bg-elevated)' }} />
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
    </div>
  );
};

export default ReviewPage;
