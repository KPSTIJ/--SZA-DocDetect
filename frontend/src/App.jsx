import React, { useState } from 'react';
import { ConfigProvider, Progress, Tag, Space } from 'antd';
import { CheckCircleFilled, ClockCircleFilled, SyncOutlined, CloseCircleFilled, ExclamationCircleFilled, InboxOutlined } from '@ant-design/icons';
import SettingsPage from './components/Settings/SettingsPage';
import ReviewPage from './components/Review/ReviewPage';
import AppHeader from './components/Layout/AppHeader';
import useJobStore from './store/jobStore';

const theme = {
  token: {
    colorPrimary: '#1a6b4a',
    colorSuccess: '#1a6b4a',
    colorWarning: '#d4943a',
    colorError: '#c43a3a',
    colorInfo: '#4a8c70',
    colorBgLayout: '#f4f7f5',
    colorBgContainer: '#ffffff',
    colorBorder: '#d9e0dc',
    colorText: '#1a1a1a',
    colorTextSecondary: '#5a6a62',
    borderRadius: 8,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: 14,
    controlHeight: 36,
    colorPrimaryHover: '#218f60',
    colorPrimaryActive: '#0d4a30',
    colorBgTextHover: '#e6f2ed',
    colorPrimaryBorder: '#b8d4c6',
    colorPrimaryBg: '#e6f2ed',
    colorSuccessBg: '#e6f2ed',
    colorWarningBg: '#fdf0e0',
    colorErrorBg: '#fce8e8',
    colorInfoBg: '#e6f2ed',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  },
};

const App = () => {
  const [activeTab, setActiveTab] = useState('settings');
  const jobs = useJobStore((s) => s.jobs);
  const getProgress = useJobStore((s) => s.getProgress);
  const p = getProgress();
  const hasJobs = p.total > 0;
  const isProcessing = p.running > 0;
  const isIdle = !hasJobs;

  return (
    <ConfigProvider theme={theme}>
      <div style={{ minHeight: '100vh', background: '#f4f7f5' }}>
        <AppHeader activeTab={activeTab} onTabChange={setActiveTab} />

        <div style={{
          maxWidth: 1400, margin: '0 auto', padding: '12px 32px 0',
          opacity: isIdle ? 0.45 : 1,
          transition: 'opacity 0.3s',
        }}>
          <div style={{
            background: '#fff', borderRadius: 10, border: '1px solid #e8efe9',
            padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
          }}>
            <div style={{ flex: '1 1 200px', minWidth: 120 }}>
              <Progress
                percent={p.percent}
                size="small"
                strokeWidth={7}
                strokeColor={isIdle ? '#d9e0dc' : { from: '#1a6b4a', to: '#d4943a' }}
                format={() => hasJobs ? `${p.completed}/${p.total}` : '0'}
              />
            </div>
            <Space size={[8, 4]} wrap>
              {isIdle && (
                <Tag icon={<InboxOutlined />} style={{ background: '#f0f0f0', color: '#909090', border: 'none', borderRadius: 4 }}>
                  Ожидание задач
                </Tag>
              )}
              {!isIdle && (
                <>
                  {p.pending > 0 && <Tag icon={<ClockCircleFilled />} color="default" style={{ borderRadius: 4 }}>{p.pending} в очереди</Tag>}
                  {p.running > 0 && <Tag icon={<SyncOutlined spin />} color="processing" style={{ borderRadius: 4 }}>{p.running} в обработке</Tag>}
                  {p.done > 0 && <Tag icon={<CheckCircleFilled />} color="success" style={{ borderRadius: 4 }}>{p.done} готово</Tag>}
                  {p.needs_review > 0 && <Tag icon={<ExclamationCircleFilled />} color="warning" style={{ borderRadius: 4 }}>{p.needs_review} на проверку</Tag>}
                  {p.failed > 0 && <Tag icon={<CloseCircleFilled />} color="error" style={{ borderRadius: 4 }}>{p.failed} ошибок</Tag>}
                </>
              )}
            </Space>
          </div>
        </div>

        <div style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 32px' }}>
          {activeTab === 'settings' ? <SettingsPage /> : <ReviewPage />}
        </div>
      </div>
    </ConfigProvider>
  );
};

export default App;
