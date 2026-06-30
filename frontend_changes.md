# Изменения во фронтенде за сессию 2026-06-29

## 1. `frontend/src/api/jobsApi.js`
Добавлен эндпоинт для удаления всей загрузки:
```js
export const deleteBatch = (batchId) => client.delete(`/jobs/batch/${batchId}`);
```

## 2. `frontend/src/store/jobStore.js`
Добавлен action `deleteBatch`:
```js
deleteBatch: async (batchId) => {
    await jobsApi.deleteBatch(batchId);
    await get().fetchJobs();
    await get().fetchReviewJobs();
},
```

## 3. `frontend/src/components/Review/ReviewPage.jsx`

### Импорты
- Добавлен `deleteBatch` в деструктуризацию `useJobStore`

### Функция `getJobColor` — синий для running, серый для pending
```js
const getJobColor = (job) => {
  if (job.status === 'failed') return { strip: '#d13a3a', label: 'Ошибка' };
  if (job.status === 'running') return { strip: '#4a9eff', label: job.processing_stage ? `${getStageLabel(job.processing_stage)}…` : 'Обрабатывается' };
  if (job.status === 'pending') return { strip: '#9ca0a8', label: 'Ожидает' };
  const allPages = job.total_pages || 0;
  if (allPages > 0 && job.error_pages === allPages) return { strip: '#d13a3a', label: 'Не распознано' };
  if (job.error_pages > 0) return { strip: '#d4943a', label: 'Частичные ошибки' };
  return { strip: '#2ea86b', label: 'Корректно' };
};
```

### Функция `getStageLabel` (новая)
```js
const getStageLabel = (stage) => {
  const map = {
    text_layer: 'Анализ текста',
    ocr_cv: 'OCR + CV',
    vlm: 'Визуальная модель',
    assembling: 'Склейка PDF',
  };
  return map[stage] || stage;
};
```

### Сортировка job'ов — running первыми, потом pending, затем остальные
```js
const filteredJobs = (() => {
    let jobs = filteredBySearch;
    if (filterTab === 'errors') jobs = jobs.filter(j => j.error_pages > 0 && j.status !== 'failed' && j.status !== 'running' && j.status !== 'pending');
    if (filterTab === 'failed') jobs = jobs.filter(j => j.status === 'failed');
    if (filterTab === 'ok') jobs = jobs.filter(j => j.status === 'done' && (j.error_pages || 0) === 0);
    if (filterTab === 'processing') jobs = jobs.filter(j => j.status === 'running' || j.status === 'pending');
    return [...jobs].sort((a, b) => {
      const order = { running: 0, pending: 1, needs_review: 2, failed: 3, done: 4 };
      return (order[a.status] ?? 9) - (order[b.status] ?? 9);
    });
  })();
```

### Фильтр-бар — статичные селекты, поиск flex:1, кнопка удаления после поиска
```jsx
<Select style={{ width: 280, flexShrink: 0 }} placeholder="Все проекты" ... />
<Select style={{ width: 280, flexShrink: 0 }} placeholder="Все загрузки" ... />
<Input style={{ minWidth: 100, flex: 1 }} placeholder="Поиск по названию..." ... />
{filterBatchId && (
  <Tooltip title="Удалить все досье этой загрузки">
    <Button danger icon={<DeleteOutlined />} onClick={handleDeleteBatch} style={{ borderRadius: 6, flexShrink: 0 }}>
      Удалить загрузку
    </Button>
  </Tooltip>
)}
```

### Функция `handleDeleteBatch` (новая)
```js
const handleDeleteBatch = () => {
    const batchInfo = batchOptions.find(b => b.value === filterBatchId);
    const label = batchInfo?.label || 'выбранную загрузку';
    const batchJobs = allJobs.filter(j => (j.batch_id ? String(j.batch_id) : j.job_id) === filterBatchId);
    apiModal.confirm({
      title: 'Удалить всю загрузку?',
      content: (
        <div>
          <div style={{ marginBottom: 8 }}>Вы уверены, что хотите удалить <b>{label}</b>?</div>
          <div style={{ color: '#d13a3a', fontWeight: 600 }}>{batchJobs.length} досье будет удалено безвозвратно.</div>
        </div>
      ),
      okText: 'Удалить всё',
      cancelText: 'Отмена',
      okButtonProps: { danger: true },
      onOk: () => deleteBatch(filterBatchId),
    });
  };
```

## 4. `frontend/src/components/Review/DossierModal.jsx`

### Импорты
```js
import { Modal, Button, Space, Select, Tooltip, Divider, App, Collapse } from 'antd';
import { DownOutlined } from '@ant-design/icons';
```

### Функция `getStageLabel` (новая)
```js
const getStageLabel = (stage) => {
  const map = { text_layer: 'Анализ текста', ocr_cv: 'OCR+CV', vlm: 'Визуальная модель', assembling: 'Склейка PDF' };
  return map[stage] || stage;
};
```

### Функция `getJobColor` — синий для running, серый для pending
```js
const getJobColor = (job) => {
  if (!job) return { header: '#2ea86b', label: 'Корректно' };
  if (job.status === 'failed') return { header: '#d13a3a', label: 'Ошибка' };
  if (job.status === 'running') return { header: '#4a9eff', label: job.processing_stage ? `${getStageLabel(job.processing_stage)}…` : 'Обрабатывается' };
  if (job.status === 'pending') return { header: '#9ca0a8', label: 'Ожидает' };
  const allPages = job.total_pages || 0;
  if (allPages > 0 && job.error_pages === allPages) return { header: '#d13a3a', label: 'Не распознано' };
  if (job.error_pages > 0) return { header: '#d4943a', label: 'Частичные ошибки' };
  return { header: '#2ea86b', label: 'Корректно' };
};
```

### Функция `groupPagesByType` — с occurrence, без сортировки по typeId
```js
const groupPagesByType = (pages) => {
  const segments = [];
  let current = null;
  for (const p of pages) {
    if (current && current.typeId === p.document_type_id) {
      current.pages.push(p);
    } else {
      if (current) segments.push(current);
      current = { typeId: p.document_type_id, typeName: p.document_type_name || 'Не распознан', pages: [p] };
    }
  }
  if (current) segments.push(current);
  const counts = {};
  segments.forEach(g => {
    if (g.typeId != null) {
      counts[g.typeId] = (counts[g.typeId] || 0) + 1;
      g.occurrence = counts[g.typeId];
    }
  });
  return segments;
};
```

### Заголовки групп — с номером occurrence
```jsx
// Для групп с ошибками (красные):
<div style={{ fontSize: 12, fontWeight: 600, color: '#d13a3a', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.3px', display: 'flex', alignItems: 'center', gap: 8 }}>
  {group.typeId != null && <span style={{ fontSize: 13, fontWeight: 700, color: '#d13a3a' }}>№{group.occurrence}</span>}
  <span>{group.typeName}</span>
  <span style={{ fontWeight: 400, opacity: 0.75, marginLeft: 4 }}>· {group.pages.length} стр.</span>
</div>

// Для корректных групп (зелёные):
<div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.3px', display: 'flex', alignItems: 'center', gap: 8 }}>
  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>№{group.occurrence}</span>
  <span>{group.typeName}</span>
  <span style={{ fontWeight: 400, opacity: 0.75, marginLeft: 4 }}>· {group.pages.length} стр.</span>
</div>
```

### React keys — уникальные (typeId + occurrence)
```jsx
// Для групп с ошибками:
<React.Fragment key={group.typeId != null ? `${group.typeId}-${group.occurrence}` : `undetected-${gi}`}>

// Для корректных групп:
<React.Fragment key={group.typeId != null ? `${group.typeId}-${group.occurrence}` : `ok-${gi}`}>
```

### Итоговые документы — Collapse (скрыты по умолчанию)
```jsx
<Collapse
  ghost
  defaultActiveKey={[]}
  expandIcon={({ isActive }) => <DownOutlined rotate={isActive ? 180 : 0} style={{ fontSize: 12 }} />}
  style={{ background: 'transparent' }}
  items={[{
    key: 'output',
    label: (
      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <DownloadOutlined /> Итоговые документы ({outputDocs.length})
      </span>
    ),
    children: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
        {outputDocs.map((doc) => (
          <div key={doc.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>
                {doc.document_type_name || doc.document_type_id}
                {doc.occurrence_index > 1 ? ` №${doc.occurrence_index}` : ''}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
                Стр. {doc.start_page + 1}–{doc.end_page + 1} · {doc.page_count} стр.
              </div>
            </div>
            <Tooltip title="Скачать PDF">
              <Button size="small" icon={<DownloadOutlined />}
                href={`${client.defaults.baseURL}/jobs/${jid}/output/${doc.id}`}
                target="_blank"
                style={{ color: 'var(--accent)', border: '1px solid var(--accent-border)', borderRadius: 6 }}
              />
            </Tooltip>
          </div>
        ))}
      </div>
    ),
  }]}
/>
```

### Кнопка «Подтвердить» — в `extra` модалки (слева от крестика)
```jsx
<Modal
  title={<div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
    <span style={{ color: 'var(--text)', fontSize: 15, fontWeight: 600 }}>{job?.source_filename || ''}</span>
    <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, color: '#fff', background: color.header, whiteSpace: 'nowrap' }}>
      {pages.length} стр · {color.label}
    </span>
    <Tooltip title="Открыть исходный PDF">
      <Button size="small" icon={<EyeOutlined />}
        onClick={() => { if (jid) openPdfViewer(jid, job?.source_filename); }}
        style={{ color: 'var(--accent)', fontSize: 13, border: '1.5px solid var(--accent)', borderRadius: 6, padding: '2px 12px', background: 'var(--accent-bg)' }}>
        Открыть исходный PDF
      </Button>
    </Tooltip>
  </div>}
  extra={
    job?.status !== 'done' && (
      <Button size="small" type="primary" onClick={handleConfirm}
        style={{ borderRadius: 6, fontSize: 13 }}>
        Подтвердить
      </Button>
    )
  }
  ...
>
```
