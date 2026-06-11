import React, { useState } from 'react';
import { ConfigProvider } from 'antd';
import SettingsPage from './components/Settings/SettingsPage';
import ReviewPage from './components/Review/ReviewPage';
import AppHeader from './components/Layout/AppHeader';

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

  return (
    <ConfigProvider theme={theme}>
      <div style={{ minHeight: '100vh', background: '#f4f7f5' }}>
        <AppHeader activeTab={activeTab} onTabChange={setActiveTab} />
        <div style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 32px' }}>
          {activeTab === 'settings' ? <SettingsPage /> : <ReviewPage />}
        </div>
      </div>
    </ConfigProvider>
  );
};

export default App;
