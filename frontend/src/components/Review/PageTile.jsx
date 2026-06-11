import React, { useRef, useEffect, useState } from 'react';
import { Skeleton, Checkbox, Tooltip } from 'antd';
import { getPagePreview } from '../../api/jobsApi';

const statusConfig = {
  undetected: { color: '#c43a3a', label: 'Undetected' },
  invalid_length: { color: '#d4943a', label: 'Invalid length' },
  low_vlm_confidence: { color: '#d4943a', label: 'Low confidence' },
  default: { color: '#1a6b4a', label: '' },
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
            .then((res) => {
              const url = URL.createObjectURL(res.data);
              setImgSrc(url);
              setLoaded(true);
            })
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
          position: 'relative',
          width: 120,
          height: 160,
          border: isSelected ? '2px solid #1a6b4a' : hover ? '2px solid #4a8c70' : '1px solid #d9e0dc',
          borderRadius: 8,
          cursor: 'pointer',
          background: '#f5f7f6',
          flexShrink: 0,
          transition: 'border-color 0.15s, box-shadow 0.15s',
          boxShadow: isSelected ? '0 0 0 3px rgba(26,107,74,0.15)' : hover ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
        }}
      >
        <Checkbox
          checked={isSelected}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            e.stopPropagation();
            onToggleSelect?.(page.page_number);
          }}
          style={{
            position: 'absolute',
            top: 5,
            left: 5,
            opacity: hover || isSelected ? 1 : 0,
            zIndex: 2,
            transition: 'opacity 0.15s',
          }}
        />
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={`Page ${page.page_number}`}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              borderRadius: 6,
            }}
          />
        ) : (
          <div style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#c0c8c3',
            fontSize: 12,
          }}>
            Загрузка...
          </div>
        )}
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          background: cfg.color,
          color: '#fff',
          fontSize: 10,
          fontWeight: 600,
          padding: '2px 6px',
          textAlign: 'center',
          borderRadius: '0 0 6px 6px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span>{page.page_number + 1}</span>
          <span style={{ opacity: 0.8 }}>{page.document_type_id || '?'}</span>
        </div>
      </div>
    </Tooltip>
  );
};

export default PageTile;
