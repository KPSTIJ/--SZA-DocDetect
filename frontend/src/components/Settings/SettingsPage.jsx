import React, { useEffect } from 'react';
import { Row, Col, Card } from 'antd';
import DocumentTypeList from './DocumentTypeList';
import UploadSection from './UploadSection';
import useConfigStore from '../../store/configStore';

const sectionStyle = {
  background: '#fff',
  borderRadius: 10,
  border: '1px solid #e8efe9',
  overflow: 'hidden',
};

const SettingsPage = () => {
  const fetchDocumentTypes = useConfigStore((s) => s.fetchDocumentTypes);

  useEffect(() => {
    fetchDocumentTypes();
  }, [fetchDocumentTypes]);

  return (
    <Row gutter={[24, 24]}>
      <Col xs={24} lg={14}>
        <div style={sectionStyle}>
          <div style={{
            padding: '16px 24px',
            borderBottom: '1px solid #e8efe9',
            background: '#f8fbf9',
            fontWeight: 600,
            fontSize: 15,
            color: '#0d4a30',
          }}>
            Типы документов
          </div>
          <div style={{ padding: 0 }}>
            <DocumentTypeList />
          </div>
        </div>
      </Col>
      <Col xs={24} lg={10}>
        <div style={sectionStyle}>
          <div style={{
            padding: '16px 24px',
            borderBottom: '1px solid #e8efe9',
            background: '#f8fbf9',
            fontWeight: 600,
            fontSize: 15,
            color: '#0d4a30',
          }}>
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
