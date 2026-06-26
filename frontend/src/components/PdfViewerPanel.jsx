import React, { useEffect, useState } from 'react';
import { Button, Tooltip } from 'antd';
import { CloseOutlined, DownloadOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons';
import useJobStore from '../store/jobStore';
import { getPagePreview, getJobPages } from '../api/jobsApi';

const PdfViewerPanel = () => {
  const { pdfViewer, closePdfViewer } = useJobStore();
  const { open, jobId, filename } = pdfViewer;
  const [pages, setPages] = useState([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !jobId) return;
    setLoading(true);
    getJobPages(jobId).then(res => {
      setPages(res.data);
      setLoading(false);
    }).catch(() => { setPages([]); setLoading(false); });
  }, [open, jobId]);

  useEffect(() => {
    if (!open) { setPages([]); setPreviewUrl(null); setCurrentPage(0); }
  }, [open]);

  useEffect(() => {
    if (!open || pages.length === 0) return;
    setPreviewUrl(null);
    getPagePreview(jobId, currentPage).then(res => {
      setPreviewUrl(URL.createObjectURL(res.data));
    }).catch(() => {});
  }, [open, jobId, currentPage, pages.length]);

  useEffect(() => {
    if (!open || pages.length === 0) return;
    const handleKey = (e) => {
      if (e.key === 'ArrowLeft') setCurrentPage(p => Math.max(0, p - 1));
      if (e.key === 'ArrowRight') setCurrentPage(p => Math.min(pages.length - 1, p + 1));
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, pages.length]);

  if (!open) return null;

  const curPageData = pages[currentPage];

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: `calc((100vh - 100px) * 210 / 297 + 40px)`, zIndex: 1100,
      background: '#1c1e24', borderLeft: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', boxShadow: '-6px 0 32px rgba(0,0,0,0.5)',
    }}>
      <div style={{
        padding: '12px 20px', borderBottom: '1px solid var(--border)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
        background: 'var(--bg-card)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
            {filename || 'PDF'}
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            {loading ? 'Загрузка...' : `${pages.length} стр.`}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Tooltip title="Скачать PDF">
            <Button size="small" icon={<DownloadOutlined />}
              href={jobId ? `/api/jobs/${jobId}/source` : '#'} target="_blank"
              style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-elevated)' }} />
          </Tooltip>
          <Tooltip title="Закрыть">
            <Button size="small" icon={<CloseOutlined />} onClick={closePdfViewer}
              style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-elevated)' }} />
          </Tooltip>
        </div>
      </div>

      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, overflow: 'hidden',
      }}
        onWheel={(e) => {
          if (e.deltaY > 0) setCurrentPage(p => Math.min(pages.length - 1, p + 1));
          if (e.deltaY < 0) setCurrentPage(p => Math.max(0, p - 1));
        }}
      >
        {!previewUrl && (
          <div style={{ color: 'var(--text-tertiary)', fontSize: 15 }}>
            {loading ? 'Загрузка...' : ''}
          </div>
        )}
        {previewUrl && (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src={previewUrl} alt={`Page ${currentPage}`}
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 4, boxShadow: '0 2px 16px rgba(0,0,0,0.4)' }} />
          </div>
        )}
      </div>

      <div style={{
        padding: '12px 20px', borderTop: '1px solid var(--border)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
        background: 'var(--bg-card)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Button size="small" icon={<LeftOutlined />}
            disabled={currentPage === 0}
            onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
            style={{ color: currentPage > 0 ? 'var(--accent)' : 'var(--text-tertiary)', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-elevated)' }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
            {pages.length > 0 ? `${currentPage + 1} / ${pages.length}` : '—'}
          </span>
          <Button size="small" icon={<RightOutlined />}
            disabled={currentPage >= pages.length - 1}
            onClick={() => setCurrentPage(p => Math.min(pages.length - 1, p + 1))}
            style={{ color: currentPage < pages.length - 1 ? 'var(--accent)' : 'var(--text-tertiary)', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-elevated)' }} />
        </div>
        {curPageData && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 12 }}>
            <span style={{ color: 'var(--text-tertiary)' }}>
              {curPageData.document_type_name || curPageData.document_type_id || 'Не распознан'}
            </span>
            {curPageData.detection_method && (
              <span style={{ color: 'var(--text-tertiary)' }}>
                {curPageData.detection_method}
              </span>
            )}
            {curPageData.confidence != null && (
              <span style={{ color: curPageData.confidence > 0.7 ? 'var(--accent)' : '#d4943a' }}>
                {(curPageData.confidence * 100).toFixed(0)}%
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PdfViewerPanel;
