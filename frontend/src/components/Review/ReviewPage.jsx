import React, { useEffect, useState, useCallback } from 'react';
import { Card, Row, Col, List, Tag, Button, Modal, Tooltip } from 'antd';
import {
  ExclamationCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  EyeOutlined,
  DownOutlined,
  RightOutlined,
} from '@ant-design/icons';
import useJobStore from '../../store/jobStore';
import useConfigStore from '../../store/configStore';
import PageTile from './PageTile';
import FloatingAssignToolbar from './FloatingAssignToolbar';

const ReviewPage = () => {
  const { reviewJobs, fetchReviewJobs, startPolling, stopPolling, selectedPages, togglePageSelection, confirmJob } =
    useJobStore();
  const { fetchDocumentTypes } = useConfigStore();

  useEffect(() => {
    fetchReviewJobs();
    fetchDocumentTypes();
    startPolling();
    return () => stopPolling();
  }, [fetchReviewJobs, fetchDocumentTypes, startPolling, stopPolling]);

  const [expandedJobs, setExpandedJobs] = useState({});
  const [pagePages, setPagePages] = useState({});
  const [previewModal, setPreviewModal] = useState({ open: false, jobId: null, pageNum: null });

  const { stats, needs_review } = reviewJobs;

  const handleToggleExpand = useCallback(async (jobId) => {
    if (!expandedJobs[jobId]) {
      try {
        const { getJobPages } = await import('../../api/jobsApi');
        const res = await getJobPages(jobId);
        setPagePages((prev) => ({ ...prev, [jobId]: res.data }));
      } catch {}
    }
    setExpandedJobs((prev) => ({ ...prev, [jobId]: !prev[jobId] }));
  }, [expandedJobs]);

  const handleConfirm = (jobId) => {
    Modal.confirm({
      title: 'Подтвердить и склеить?',
      icon: null,
      content: <span style={{ color: '#5a6a62' }}>Создать итоговые PDF-файлы на основе текущего распределения страниц?</span>,
      okText: 'Подтвердить',
      onOk: () => confirmJob(jobId),
    });
  };

  const expandedJobId = Object.keys(expandedJobs).find((k) => expandedJobs[k]);

  const statCardStyle = {
    borderRadius: 10,
    border: '1px solid #e8efe9',
  };

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {[
          { label: 'Требуют проверки', value: stats.needs_review_count || 0, icon: <ExclamationCircleOutlined />, color: '#d4943a' },
          { label: 'Готово', value: stats.done_count || 0, icon: <CheckCircleOutlined />, color: '#1a6b4a' },
          { label: 'Ошибки', value: stats.failed_count || 0, icon: <CloseCircleOutlined />, color: '#c43a3a' },
          { label: 'Страниц с ошибками', value: stats.total_error_pages || 0, icon: <ExclamationCircleOutlined />, color: '#c43a3a' },
        ].map((item) => (
          <Col key={item.label} xs={12} sm={6}>
            <Card style={statCardStyle} styles={{ body: { padding: '16px 20px' } }}>
              <div style={{ fontSize: 13, color: '#8a9a92', marginBottom: 8 }}>{item.label}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: item.color, fontSize: 22, display: 'flex', alignItems: 'center' }}>{item.icon}</span>
                <span style={{ color: '#1a1a1a', fontSize: 28, fontWeight: 700, lineHeight: 1 }}>{item.value}</span>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <div style={{
        background: '#fff',
        borderRadius: 10,
        border: '1px solid #e8efe9',
      }}>
        <div style={{
          padding: '16px 24px',
          borderBottom: '1px solid #e8efe9',
          background: '#f8fbf9',
          fontWeight: 600,
          fontSize: 15,
          color: '#0d4a30',
        }}>
          Досье, требующие проверки
        </div>
        <div style={{ padding: '12px 16px' }}>
          <List
            dataSource={needs_review}
            locale={{ emptyText: (
              <div style={{ padding: 40, textAlign: 'center', color: '#8a9a92' }}>
                <CheckCircleOutlined style={{ fontSize: 32, color: '#1a6b4a', marginBottom: 8 }} />
                <div>Все досье обработаны успешно</div>
              </div>
            )}}
            renderItem={(job) => {
              const isExpanded = Boolean(expandedJobs[job.job_id]);
              const pages = pagePages[job.job_id] || [];
              const jid = job.job_id;
              const hasErrors = job.error_pages > 0;
              return (
                <Card
                  size="small"
                  key={jid}
                  style={{
                    marginBottom: 8,
                    borderRadius: 8,
                    borderLeft: `4px solid ${hasErrors ? '#d4943a' : '#c43a3a'}`,
                    borderTop: '1px solid #e8efe9',
                    borderRight: '1px solid #e8efe9',
                    borderBottom: '1px solid #e8efe9',
                  }}
                  styles={{ body: { padding: '12px 16px' } }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                      <Button
                        type="text"
                        size="small"
                        icon={isExpanded ? <DownOutlined /> : <RightOutlined />}
                        onClick={() => handleToggleExpand(jid)}
                        style={{ color: '#4a8c70', flexShrink: 0 }}
                      />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {job.source_filename}
                        </div>
                        <div style={{ fontSize: 12, color: '#8a9a92', marginTop: 2 }}>
                          {job.total_pages || '?'} pages ·{' '}
                          <Tag style={{
                            background: statusColors[job.status]?.bg || '#f0f0f0',
                            color: statusColors[job.status]?.color || '#909090',
                            border: 'none', borderRadius: 4, fontSize: 11,
                          }}>
                            {job.status}
                          </Tag>
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      <Tooltip title="Открыть исходный PDF">
                        <Button
                          type="text"
                          icon={<EyeOutlined />}
                          href={`/api/jobs/${jid}/source`}
                          target="_blank"
                          style={{ color: '#4a8c70' }}
                        />
                      </Tooltip>
                      <Button
                        size="small"
                        onClick={() => handleToggleExpand(jid)}
                        style={{
                          borderRadius: 6,
                          borderColor: '#b8d4c6',
                          color: '#1a6b4a',
                          fontSize: 12,
                        }}
                      >
                        {isExpanded ? 'Свернуть' : 'Просмотр'}
                      </Button>
                      <Button
                        size="small"
                        type="primary"
                        onClick={() => handleConfirm(jid)}
                        style={{ borderRadius: 6, fontSize: 12 }}
                      >
                        Подтвердить и склеить
                      </Button>
                    </div>
                  </div>
                  {isExpanded && (
                    <div style={{
                      marginTop: 12,
                      paddingTop: 12,
                      borderTop: '1px solid #e8efe9',
                      overflowX: 'auto',
                      whiteSpace: 'nowrap',
                      paddingBottom: 4,
                    }}>
                      {pages.map((page) => (
                        <span key={page.page_number} style={{ display: 'inline-block', marginRight: 8 }}>
                          <PageTile
                            jobId={jid}
                            page={page}
                            isSelected={selectedPages[jid]?.has(page.page_number)}
                            onToggleSelect={(pn) => togglePageSelection(jid, pn)}
                            onClickPreview={(pn) => setPreviewModal({ open: true, jobId: jid, pageNum: pn })}
                          />
                        </span>
                      ))}
                      {pages.length === 0 && (
                        <div style={{ color: '#8a9a92', fontSize: 13, padding: 8, textAlign: 'center' }}>
                          No pages data available
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              );
            }}
          />
        </div>
      </div>

      {expandedJobId && <FloatingAssignToolbar jobId={expandedJobId} />}

      <Modal
        title={`Page ${previewModal.pageNum != null ? previewModal.pageNum + 1 : ''}`}
        open={previewModal.open}
        onCancel={() => setPreviewModal({ open: false, jobId: null, pageNum: null })}
        footer={null}
        width={800}
        styles={{ body: { padding: 0 } }}
      >
        {previewModal.jobId && previewModal.pageNum != null && (
          <img
            src={`/api/jobs/${previewModal.jobId}/page/${previewModal.pageNum}/preview`}
            alt={`Page ${previewModal.pageNum}`}
            style={{ width: '100%', display: 'block' }}
          />
        )}
      </Modal>
    </div>
  );
};

const statusColors = {
  needs_review: { color: '#d4943a', bg: '#fdf0e0' },
  done: { color: '#1a6b4a', bg: '#e6f2ed' },
  failed: { color: '#c43a3a', bg: '#fce8e8' },
};

export default ReviewPage;
