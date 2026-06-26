import React, { useRef, useEffect, useState } from 'react';
import { Checkbox, Tooltip } from 'antd';
import { FileTextOutlined } from '@ant-design/icons';
import { getPagePreview } from '../../api/jobsApi';

const statusConfig = {
  undetected: { color: '#d13a3a' },
  invalid_length: { color: '#d4943a' },
  low_vlm_confidence: { color: '#d4943a' },
  default: { color: '#2ea86b' },
};

const PageTile = ({ jobId, page, isSelected, onToggleSelect, onClickPreview }) => {
  const [imgSrc, setImgSrc] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [hover, setHover] = useState(false);
  const imgRef = useRef(null);

  const cfg = statusConfig[page.error_code] || (page.document_type_id ? statusConfig.default : statusConfig.undetected);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          getPagePreview(jobId, page.page_number)
            .then((res) => { const url = URL.createObjectURL(res.data); setImgSrc(url); setLoaded(true); })
            .catch(() => setLoaded(true));
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    if (imgRef.current) observer.observe(imgRef.current);
    return () => observer.disconnect();
  }, [jobId, page.page_number]);

  return (
    <Tooltip title={`Стр. ${page.page_number + 1}${page.document_type_id ? ` · ${page.document_type_id}` : ''}`}>
      <div
        ref={imgRef}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={() => onClickPreview?.(page.page_number)}
        style={{
          width: 150, height: 200, flexShrink: 0,
          borderRadius: 8, cursor: 'pointer',
          background: 'var(--bg-elevated)',
          border: isSelected ? '2px solid var(--accent)' : hover ? '2px solid #ffffff' : '1px solid var(--border)',
          boxShadow: isSelected ? '0 0 0 6px #3dbf7d' : 'none',
          transition: 'border 0.15s, border-color 0.15s, box-shadow 0.15s',
        }}
      >
        <div style={{ width: '100%', height: '100%', borderRadius: 6, overflow: 'hidden', position: 'relative' }}>
          <Checkbox checked={isSelected}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => { e.stopPropagation(); onToggleSelect?.(page.page_number); }}
            style={{
              position: 'absolute', top: 6, left: 6, opacity: hover || isSelected ? 1 : 0, zIndex: 2,
              transition: 'opacity 0.15s', transform: 'scale(1.3)',
            }}
          />
          {imgSrc ? (
            <img src={imgSrc} alt={`Page ${page.page_number}`}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{
              width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-tertiary)',
            }}>
              <style>{`
                @keyframes pulse { 0%, 100% { opacity: 0.25; } 50% { opacity: 0.65; } }
              `}</style>
              <FileTextOutlined style={{
                fontSize: 106, opacity: 0.4, animation: 'pulse 2.5s ease-in-out infinite',
                marginTop: -12,
              }} />
            </div>
          )}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, background: cfg.color,
            color: '#fff', fontSize: 13, fontWeight: 800, padding: '1px 8px 2px',
            textAlign: 'center', lineHeight: '22px',
          }}>
            {page.page_number + 1}
          </div>
        </div>
      </div>
    </Tooltip>
  );
};

export default PageTile;
