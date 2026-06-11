import React from 'react';
import { Tabs } from 'antd';
import { Settings, Review } from '../Icons';

const AppHeader = ({ activeTab, onTabChange }) => (
  <div style={{
    background: 'linear-gradient(135deg, #0d4a30 0%, #1a6b4a 100%)',
    padding: '0 32px',
    boxShadow: '0 2px 12px rgba(13,74,48,0.25)',
    position: 'sticky',
    top: 0,
    zIndex: 100,
  }}>
    <div style={{
      display: 'flex',
      alignItems: 'center',
      height: 76,
      maxWidth: 1400,
      margin: '0 auto',
    }}>
      <img
        src="/logo.png"
        alt="Logo"
        style={{ height: 44, width: 'auto', marginRight: 16, borderRadius: 8 }}
      />
      <div style={{ flex: 1 }}>
        <div style={{ color: '#fff', fontSize: 22, fontWeight: 700, letterSpacing: '-0.3px' }}>
          PDF Dossier Splitter
        </div>
        <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, marginTop: 1 }}>
          Система автоматической разрезки PDF-досье
        </div>
      </div>
      <Tabs
        activeKey={activeTab}
        onChange={onTabChange}
        items={[
          { key: 'settings', label: (
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 600,
              padding: '6px 16px', borderRadius: 8,
              background: activeTab === 'settings' ? 'rgba(255,255,255,0.2)' : 'transparent',
              color: '#fff', transition: 'background 0.2s',
            }}>
              <Settings /> Настройки
            </span>
          )},
          { key: 'review', label: (
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 600,
              padding: '6px 16px', borderRadius: 8,
              background: activeTab === 'review' ? 'rgba(255,255,255,0.2)' : 'transparent',
              color: '#fff', transition: 'background 0.2s',
            }}>
              <Review /> Разбор
            </span>
          )},
        ]}
        style={{ marginBottom: 0 }}
        tabBarStyle={{
          marginBottom: 0, borderBottom: 'none',
        }}
      />
    </div>
  </div>
);

export default AppHeader;
