import React from 'react';
import { Tabs, Button, Tooltip } from 'antd';
import { MoonOutlined, SunOutlined } from '@ant-design/icons';
import { Settings, Review } from '../Icons';

const tabBtnStyle = (active) => ({
  display: 'flex', alignItems: 'center', gap: 8,
  fontSize: 15, fontWeight: 600,
  padding: '6px 16px', borderRadius: 8,
  background: active ? 'rgba(255,255,255,0.2)' : 'transparent',
  color: '#fff',
  transition: 'background 0.2s',
});

const AppHeader = ({ activeTab, onTabChange, dark, onToggleTheme }) => (
  <div style={{
    background: 'linear-gradient(135deg, #0d4a30 0%, #1a6b4a 100%)',
    padding: '0 24px 0 32px',
    boxShadow: '0 2px 12px rgba(13,74,48,0.25)',
    position: 'sticky',
    top: 0,
    zIndex: 100,
  }}>
    <style>{`
      .ant-tabs-nav::before { border-bottom: none !important; }
      .ant-tabs-nav { border-bottom: none !important; box-shadow: none !important; }
      .ant-tabs-ink-bar { display: none !important; }
    `}</style>
    <div style={{
      display: 'flex',
      alignItems: 'center',
      height: 76,
      maxWidth: 1400,
      margin: '0 auto',
      gap: 12,
    }}>
      <img
        src="/logo.png"
        alt="Logo"
        style={{ height: 44, width: 'auto', marginRight: 4, borderRadius: 8, flexShrink: 0 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: '#fff', fontSize: 24, fontWeight: 700, letterSpacing: '-0.3px' }}>
          SZA DocDetect
        </div>
        <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, marginTop: 1 }}>
          Система автоматической разрезки PDF-досье
        </div>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={onTabChange}
        items={[
          { key: 'settings', label: <span style={tabBtnStyle(activeTab === 'settings')}><Settings /> Настройки</span> },
          { key: 'review', label: <span style={tabBtnStyle(activeTab === 'review')}><Review /> Разбор</span> },
        ]}
        style={{ marginBottom: 0, marginRight: 12, flexShrink: 0 }}
        tabBarStyle={{ marginBottom: 0, borderBottom: 'none', background: 'transparent', boxShadow: 'none' }}
        indicator={{ size: 0 }}
      />

      <Tooltip title={dark ? 'Светлая тема' : 'Тёмная тема'}>
        <Button
          type="text"
          icon={dark ? <SunOutlined /> : <MoonOutlined />}
          onClick={onToggleTheme}
          style={{
            color: 'rgba(255,255,255,0.8)',
            fontSize: 20,
            width: 40,
            height: 40,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        />
      </Tooltip>
    </div>
  </div>
);

export default AppHeader;
