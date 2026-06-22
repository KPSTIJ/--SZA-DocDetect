import React, { useState, useEffect } from 'react';
import { ConfigProvider, Tag, Space } from 'antd';
import {
  CheckCircleFilled, ClockCircleFilled, SyncOutlined,
  CloseCircleFilled, ExclamationCircleFilled, InboxOutlined,
} from '@ant-design/icons';
import { lightTheme, darkTheme } from './theme';
import SettingsPage from './components/Settings/SettingsPage';
import ReviewPage from './components/Review/ReviewPage';
import AppHeader from './components/Layout/AppHeader';
import PdfViewerPanel from './components/PdfViewerPanel';
import useJobStore from './store/jobStore';

const STORAGE_KEY = 'sza_theme';

const App = () => {
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? saved === 'dark' : true;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light');
    document.body.setAttribute('data-theme', dark ? 'dark' : 'light');
  }, [dark]);

  const [activeTab, setActiveTab] = useState('settings');
  const jobs = useJobStore((s) => s.jobs);
  const getProgress = useJobStore((s) => s.getProgress);
  const pdfViewer = useJobStore((s) => s.pdfViewer);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const calcWidth = () => Math.round((window.innerHeight - 100) * 210 / 297 + 40);
    const w = pdfViewer.open ? `${calcWidth()}px` : '';
    document.body.style.paddingRight = w;
    document.body.style.setProperty('--panel-width', w);
    if (pdfViewer.open) {
      document.body.setAttribute('data-panel-open', '');
    } else {
      document.body.removeAttribute('data-panel-open');
    }
    return () => {
      document.body.style.paddingRight = '';
      document.body.style.removeProperty('--panel-width');
      document.body.removeAttribute('data-panel-open');
    };
  }, [pdfViewer.open]);
  const p = getProgress();
  const hasJobs = p.total > 0;
  const isIdle = !hasJobs;

  const doneFrac = p.total > 0 ? p.done / p.total : 0;
  const reviewFrac = p.total > 0 ? p.needs_review / p.total : 0;
  const failedFrac = p.total > 0 ? p.failed / p.total : 0;

  const theme = dark ? darkTheme : lightTheme;
  return (
    <ConfigProvider theme={theme}>
      <div style={{ minHeight: '100vh', fontSize: 15 }} data-theme={dark ? 'dark' : 'light'}>
        <style>{`
          [data-theme] {
            --bg-card: #32353d;
            --bg-elevated: #3a3d46;
            --border: #484b54;
            --text: #eceff2;
            --text-secondary: #bfc3cc;
            --text-tertiary: #9ea3ad;
            --accent: #3dbf7d;
            --accent-bg: rgba(61,191,125,0.13);
            --accent-border: rgba(61,191,125,0.35);
            --dragger-bg: #292c33;
            --btn-primary-color: #ffffff;
            --btn-primary-bg: #3dbf7d;
            --btn-primary-bg-hover: #4dd48a;
            --btn-primary-bg-disabled: #3a3d46;
            --btn-primary-color-disabled: #6b7078;
            background-color: #24262c;
          }
          [data-theme="light"] {
            --bg-card: #ffffff;
            --bg-elevated: #ffffff;
            --border: #e8efe9;
            --text: #1a1a1a;
            --text-secondary: #5a6a62;
            --text-tertiary: #8a9a92;
            --accent: #1a6b4a;
            --accent-bg: #e6f2ed;
            --accent-border: #b8d4c6;
            --dragger-bg: #f8fbf9;
            --btn-primary-color: #1a1a1a;
            --btn-primary-bg: #b8e6cc;
            --btn-primary-bg-hover: #9cdbb8;
            --btn-primary-bg-disabled: #e8efe9;
            --btn-primary-color-disabled: #b0b8b4;
            background-color: #f4f7f5;
          }
          [data-theme] .ant-btn-primary:not(:disabled) {
            color: var(--btn-primary-color) !important;
            background: var(--btn-primary-bg) !important;
            border-color: transparent !important;
          }
          [data-theme] .ant-btn-primary:not(:disabled):hover {
            background: var(--btn-primary-bg-hover) !important;
          }
          [data-theme] .ant-btn-primary:disabled {
            color: var(--btn-primary-color-disabled) !important;
            background: var(--btn-primary-bg-disabled) !important;
            border-color: transparent !important;
          }
          [data-theme] * {
            transition: background 0.1s ease-in-out, border-color 0.1s ease-in-out, color 0.1s ease-in-out !important;
          }
          body[data-panel-open] .ant-modal-wrap {
            padding-right: var(--panel-width, 660px);
          }
          body[data-theme]::-webkit-scrollbar,
          body[data-theme] ::-webkit-scrollbar {
            width: 8px;
            height: 8px;
          }
          body[data-theme]::-webkit-scrollbar-track,
          body[data-theme] ::-webkit-scrollbar-track {
            background: transparent;
          }
          body[data-theme]::-webkit-scrollbar-thumb,
          body[data-theme] ::-webkit-scrollbar-thumb {
            background: #5a5e66;
            border-radius: 4px;
          }
          body[data-theme]::-webkit-scrollbar-thumb:hover,
          body[data-theme] ::-webkit-scrollbar-thumb:hover {
            background: #6b7078;
          }
          body[data-theme="light"]::-webkit-scrollbar-thumb,
          body[data-theme="light"] ::-webkit-scrollbar-thumb {
            background: #d0d0d0;
          }
          body[data-theme="light"]::-webkit-scrollbar-thumb:hover,
          body[data-theme="light"] ::-webkit-scrollbar-thumb:hover {
            background: #b8b8b8;
          }
          [data-theme] .ant-select-selection-item {
            color: var(--text) !important;
          }
          [data-theme] .ant-select-selection-placeholder {
            color: var(--text-tertiary) !important;
          }
          [data-theme] .ant-table { font-size: 14px; }
          [data-theme] .ant-list-item { font-size: 14px; }
          [data-theme] .ant-card { font-size: 14px; }
          [data-theme] .ant-tag { font-size: 12px; }
          [data-theme] .ant-btn { font-size: 14px; }
        `}</style>
        <AppHeader activeTab={activeTab} onTabChange={setActiveTab} dark={dark} onToggleTheme={() => setDark(!dark)} />

        <div style={{
          maxWidth: 1400, margin: '0 auto', padding: '16px 32px 0',
          opacity: isIdle ? 0.45 : 1,
          transition: 'opacity 0.3s',
        }}>
          <div style={{
            background: 'var(--bg-card)', borderRadius: 10, border: '1px solid var(--border)',
            padding: '18px 24px', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap',
          }}>
            <div style={{ flex: '1 1 200px', minWidth: 140 }}>
              <div style={{
                height: 10, borderRadius: 5, background: 'var(--bg-elevated)',
                overflow: 'hidden', display: 'flex',
              }}>
                <div style={{ width: `${doneFrac * 100}%`, background: '#2ea86b', transition: 'width 0.3s' }} />
                <div style={{ width: `${reviewFrac * 100}%`, background: '#d4943a', transition: 'width 0.3s' }} />
                <div style={{ width: `${failedFrac * 100}%`, background: '#d13a3a', transition: 'width 0.3s' }} />
              </div>
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>
              {hasJobs ? (
                <span>
                  <span style={{ color: 'var(--text-secondary)' }}>{p.completed}</span>
                  <span style={{ color: 'var(--text-tertiary)', margin: '0 3px' }}>/</span>
                  <span style={{ color: 'var(--text)' }}>{p.total}</span>
                  {p.running + p.pending > 0 && (
                    <span style={{ color: 'var(--text-tertiary)', fontSize: 13, fontWeight: 400, marginLeft: 10 }}>
                      ({p.running + p.pending} в обработке)
                    </span>
                  )}
                  <span style={{ color: 'var(--text-tertiary)', margin: '0 8px' }}>-</span>
                  <span style={{ color: '#2ea86b' }}>{p.done}</span>
                  <span style={{ color: 'var(--text-tertiary)', margin: '0 3px' }}>/</span>
                  <span style={{ color: '#d4943a' }}>{p.needs_review}</span>
                  <span style={{ color: 'var(--text-tertiary)', margin: '0 3px' }}>/</span>
                  <span style={{ color: '#d13a3a' }}>{p.failed}</span>
                </span>
              ) : (
                <span style={{ color: 'var(--text-tertiary)', fontWeight: 400, fontSize: 14 }}>Нет задач</span>
              )}
            </div>
            <Space size={[10, 6]} wrap>
              {isIdle && (
                <Tag icon={<InboxOutlined />} style={{
                  background: dark ? '#2f3137' : '#f0f0f0',
                  color: dark ? '#6b7078' : '#909090',
                  border: 'none', borderRadius: 4, fontSize: 13, padding: '2px 10px',
                }}>
                  Ожидание задач
                </Tag>
              )}
              {!isIdle && (
                <>
                  {p.pending > 0 && buildTag(ClockCircleFilled, '#9ca0a8', 'rgba(108,117,125,0.15)', `${p.pending} в очереди`)}
                  {p.running > 0 && buildTag(SyncOutlined, '#2ea86b', 'rgba(46,168,107,0.15)', `${p.running} в обработке`, true)}
                  {p.done > 0 && buildTag(CheckCircleFilled, '#2ea86b', 'rgba(46,168,107,0.15)', `${p.done} готово`)}
                  {p.needs_review > 0 && buildTag(ExclamationCircleFilled, '#d4943a', 'rgba(212,148,58,0.15)', `${p.needs_review} на проверку`)}
                  {p.failed > 0 && buildTag(CloseCircleFilled, '#d13a3a', 'rgba(209,58,58,0.15)', `${p.failed} ошибок`)}
                </>
              )}
            </Space>
          </div>
        </div>

        <div style={{ maxWidth: 1400, margin: '0 auto', padding: '28px 32px' }}>
          {activeTab === 'settings' ? <SettingsPage /> : <ReviewPage />}
        </div>
      </div>

      <PdfViewerPanel />
    </ConfigProvider>
  );
};

const buildTag = (Icon, color, bg, text, spin) => (
  <Tag icon={<Icon spin={spin} />} style={{ background: bg, color, border: 'none', borderRadius: 4, fontSize: 13, padding: '2px 10px' }}>
    {text}
  </Tag>
);

export default App;
