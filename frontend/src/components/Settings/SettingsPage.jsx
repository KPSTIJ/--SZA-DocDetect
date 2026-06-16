import React, { useEffect } from 'react';
import { Row, Col } from 'antd';
import DocumentTypeList from './DocumentTypeList';
import UploadSection from './UploadSection';
import useConfigStore from '../../store/configStore';

const SettingsPage = () => {
  const fetchDocumentTypes = useConfigStore((s) => s.fetchDocumentTypes);

  useEffect(() => {
    fetchDocumentTypes();
  }, [fetchDocumentTypes]);

  return (
    <Row gutter={[24, 24]}>
      <Col xs={24} lg={16}>
        <DocumentTypeList />
      </Col>
      <Col xs={24} lg={8}>
        <div style={{ background: 'var(--bg-card)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)', fontWeight: 600, fontSize: 15, color: 'var(--text)' }}>
            Загрузка и обработка
          </div>
          <div style={{ padding: 24 }}>
            <UploadSection />
          </div>
        </div>
      </Col>
    </Row>
  );
};

export default SettingsPage;
