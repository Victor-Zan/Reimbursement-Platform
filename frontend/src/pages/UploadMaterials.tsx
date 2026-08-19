import { useState } from 'react';
import FileUploader from '../components/FileUploader';
import StepIndicator from '../components/StepIndicator';
import { OCRResult, OCRFileResult, ReimbursementType, MaterialKey } from '../types';
import { TYPE_MATERIALS, materialFor } from '../config/materials';
import type { MaterialFilesState } from '../App';
import Icon from '../components/Icon';
import { useFeedback } from '../components/Feedback';

interface Props {
  reimbType: ReimbursementType;
  materials: MaterialFilesState;
  setMaterialFiles: (key: MaterialKey, files: File[]) => void;
  clearMaterialExisting: (key: MaterialKey) => void;
  ocrResults: OCRResult[];
  setOcrResults: (results: OCRResult[]) => void;
  ocrLoading: boolean;
  setOcrLoading: (v: boolean) => void;
  applyOCRResults: (results: OCRResult[]) => void;
  onAddManualInvoice: () => void;
  invoiceSectionCount: number;
  onNext: () => void;
  onHome: () => void;
}

export default function UploadMaterials({
  reimbType,
  materials,
  setMaterialFiles,
  clearMaterialExisting,
  ocrResults,
  setOcrResults,
  ocrLoading,
  setOcrLoading,
  applyOCRResults,
  onAddManualInvoice,
  invoiceSectionCount,
  onNext,
  onHome,
}: Props) {
  const { toast } = useFeedback();
  const typeMaterials = TYPE_MATERIALS[reimbType];
  const isReEdit = typeMaterials.some(k => materials[k].existingUrls.length > 0 || materials[k].existingPaths.length > 0);
  const [ocrError, setOcrError] = useState('');

  const handleBatchOCR = async () => {
    if (materials.invoices.files.length === 0) return;
    setOcrLoading(true);
    setOcrError('');

    const form = new FormData();
    materials.invoices.files.forEach(f => form.append('files', f));

    try {
      const resp = await fetch('/api/v1/ocr/invoices', { method: 'POST', body: form });
      const json = await resp.json();
      if (!json.success) { setOcrError('批量识别失败'); return; }
      const results: OCRFileResult[] = json.results || [];
      const failed = results.filter(r => !r.success);
      if (failed.length > 0) setOcrError(`${failed.length} 张发票识别失败：${failed.map(f => f.filename).join('、')}`);
      const successResults: OCRResult[] = results.filter(r => r.success && r.data).map(r => r.data!);
      setOcrResults(successResults);
      applyOCRResults(successResults);
    } catch { setOcrError('网络错误，请检查后端是否启动'); }
    finally { setOcrLoading(false); }
  };

  const handleSetFiles = (key: MaterialKey) => (files: File[]) => {
    const cfg = materialFor(reimbType, key);
    let next = files;
    if (cfg.maxCount !== null && next.length > cfg.maxCount) {
      toast(`${cfg.label}最多上传 ${cfg.maxCount} 张`, 'warn');
      next = next.slice(0, cfg.maxCount);
    }
    setMaterialFiles(key, next);
    // 重编辑时新增发票文件 = 替换原有发票（与既有增值税行为一致），需重新识别
    if (key === 'invoices' && cfg.useOCR && next.length > 0 && isReEdit) {
      setOcrResults([]);
      clearMaterialExisting(key);
    }
  };

  const countFor = (key: MaterialKey) => materials[key].files.length + materials[key].existingUrls.length;
  const canNext =
    typeMaterials.every(k => {
      const cfg = materialFor(reimbType, k);
      if (k === 'invoices') return invoiceSectionCount > 0 && countFor(k) >= cfg.minCount;   // OCR 或手动票
      return countFor(k) >= cfg.minCount;
    }) &&
    typeMaterials.every(k => {
      const cfg = materialFor(reimbType, k);
      return cfg.maxCount === null || countFor(k) <= cfg.maxCount;
    });

  return (
    <>
      <StepIndicator current={1} />
      {isReEdit && (
        <div className="banner-purple">
          <Icon name="edit" size={16} />
          <span style={{ fontWeight: 600 }}>正在重新编辑被打回的报销申请</span>
          <span style={{ marginLeft: 12 }}>原有文件已保留，可替换或追加。仅替换材料不影响已填写内容。</span>
        </div>
      )}

      {typeMaterials.map(key => {
        const cfg = materialFor(reimbType, key);
        const entry = materials[key];
        const isInvoice = key === 'invoices';
        const isOCRInvoice = isInvoice && cfg.useOCR;
        const showManualAdd = isOCRInvoice && (reimbType === 'travel' || ocrError !== '');

        return (
          <div className="card" key={key}>
            <h2 className="card-title"><Icon name={cfg.icon} size={18} /> 上传{cfg.label}</h2>
            <p className="card-sub" style={{ marginBottom: 12 }}>{cfg.hint}</p>
            {entry.existingUrls.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <span className="form-label">原有文件：</span>
                <div className="file-list">
                  {entry.existingUrls.map((url, i) => (
                    <div key={i} className="file-chip">
                      <a href={url} target="_blank" rel="noreferrer" className="file-link"><Icon name={cfg.icon} size={14} /> {cfg.label}_{i + 1}</a>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <FileUploader file={null} setFile={() => {}} files={entry.files} setFiles={handleSetFiles(key)}
              label={isReEdit ? "替换或追加（可选）" : `点击或拖拽上传${cfg.label}（可多选）`} accept={cfg.accept} hint={cfg.hint} multiple />

            {isOCRInvoice && entry.files.length > 0 && ocrResults.length === 0 && (
              <button className="btn btn-primary" onClick={handleBatchOCR} disabled={ocrLoading} style={{ marginTop: 16 }}>
                {ocrLoading ? <><span className="spinner" /> 正在识别 {entry.files.length} 张发票...</> : <><Icon name="search" size={15} /> 开始识别 {entry.files.length} 张发票</>}
              </button>
            )}
            {isOCRInvoice && ocrError && <div className="alert alert-error" style={{ marginTop: 12 }}>{ocrError}</div>}
            {isOCRInvoice && showManualAdd && (
              <button className="btn btn-secondary btn-sm" onClick={onAddManualInvoice} style={{ marginTop: 12 }}>
                <Icon name="edit" size={14} /> 手动添加{cfg.label}（不识别，在下一步填写）
              </button>
            )}
            {isOCRInvoice && ocrResults.length > 0 && (
              <div style={{ marginTop: 16 }}>
                {ocrResults.map((result, idx) => (
                  <div key={idx} className="ocr-card">
                    <h3 className="section-title"><Icon name="receipt" size={16} /> 发票 {idx + 1}</h3>
                    <div className="ocr-grid">
                      <div><span className="ocr-label">购买方名称</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span className="ocr-value">{result.buyer_name || '未识别'}</span>
                          {result.buyer_name && <span className={`badge ${result.buyer_name_valid ? 'badge-ok' : 'badge-warn'}`}><Icon name={result.buyer_name_valid ? 'check' : 'alert-triangle'} size={12} /></span>}
                        </div>
                      </div>
                      <div><span className="ocr-label">纳税人识别号</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span className="ocr-value">{result.buyer_tax_id || '未识别'}</span>
                          {result.buyer_tax_id && <span className={`badge ${result.buyer_tax_id_valid ? 'badge-ok' : 'badge-warn'}`}><Icon name={result.buyer_tax_id_valid ? 'check' : 'alert-triangle'} size={12} /></span>}
                        </div>
                      </div>
                    </div>
                    <div className="ocr-grid" style={{ marginTop: 8 }}>
                      <div><span className="ocr-label">开票日期</span><span className="ocr-value">{result.invoice_date || '未识别'}</span></div>
                      <div><span className="ocr-label">发票总额</span><span className="ocr-value">¥{result.invoice_total.toFixed(2)}</span></div>
                    </div>
                    {result.items.length > 0 && (
                      <div style={{ marginTop: 12 }}><span className="ocr-label">识别到的明细项</span>
                        <div className="table-wrapper" style={{ marginTop: 4 }}><table><thead><tr><th>物品名称</th><th>单价(税前)</th><th>数量</th><th>金额</th><th>税额</th></tr></thead>
                          <tbody>{result.items.map((item, i) => (<tr key={i}><td>{item.name}</td><td className="table-num">¥{item.unit_price.toFixed(2)}</td><td>{item.quantity}</td><td className="table-num">¥{item.amount.toFixed(2)}</td><td className="table-num">¥{item.tax_amount.toFixed(2)}</td></tr>))}</tbody>
                        </table></div>
                      </div>
                    )}
                  </div>
                ))}
                <button className="btn btn-ghost btn-sm" onClick={handleBatchOCR} disabled={ocrLoading}><Icon name="refresh" size={14} /> 重新识别全部发票</button>
              </div>
            )}
          </div>
        );
      })}

      <div className="btn-actions">
        <button className="btn btn-secondary" onClick={onHome}><Icon name="arrow-left" size={15} /> 返回首页</button>
        <button className="btn btn-primary" disabled={!canNext} onClick={onNext}>下一步：填写报销表 <Icon name="arrow-right" size={15} /></button>
      </div>
    </>
  );
}
