import { useState } from 'react';
import FileUploader from '../components/FileUploader';
import StepIndicator from '../components/StepIndicator';
import { OCRResult, OCRFileResult } from '../types';

interface Props {
  invoiceFiles: File[];
  setInvoiceFiles: (files: File[]) => void;
  evidenceFiles: File[];
  setEvidenceFiles: (files: File[]) => void;
  ocrResults: OCRResult[];
  setOcrResults: (results: OCRResult[]) => void;
  ocrLoading: boolean;
  setOcrLoading: (v: boolean) => void;
  applyOCRResults: (results: OCRResult[]) => void;
  onNext: () => void;
  onHome: () => void;
  reEditInvoiceUrls?: string[];
  reEditEvidenceUrls?: string[];
  onClearReEdit?: () => void;
}

export default function UploadMaterials({
  invoiceFiles,
  setInvoiceFiles,
  evidenceFiles,
  setEvidenceFiles,
  ocrResults,
  setOcrResults,
  ocrLoading,
  setOcrLoading,
  applyOCRResults,
  onNext,
  onHome,
  reEditInvoiceUrls = [],
  reEditEvidenceUrls = [],
  onClearReEdit,
}: Props) {
  const isReEdit = reEditInvoiceUrls.length > 0 || reEditEvidenceUrls.length > 0;
  const [ocrError, setOcrError] = useState('');

  const handleBatchOCR = async () => {
    if (invoiceFiles.length === 0) return;
    setOcrLoading(true);
    setOcrError('');

    const form = new FormData();
    invoiceFiles.forEach(f => form.append('files', f));

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

  const totalEvidence = evidenceFiles.length + reEditEvidenceUrls.length;
  const canNext = ocrResults.length > 0 && totalEvidence >= 1;

  return (
    <>
      <StepIndicator current={1} />
      {isReEdit && (
        <div className="card" style={{ border: '2px solid var(--primary)', background: 'var(--primary-light)' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--primary)' }}>📝 正在重新编辑被打回的报销申请</span>
          <span style={{ fontSize: 13, color: 'var(--gray-600)', marginLeft: 12 }}>原有文件已保留，可替换或追加。仅替换凭证不影响已填写内容。</span>
        </div>
      )}
      <div className="card">
        <h2 className="card-title">📎 上传发票（支持多张）</h2>
        <p style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 12 }}>一次活动可上传多张发票，所有发票合并到同一张报销表中</p>
        {reEditInvoiceUrls.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <span className="form-label">原有发票文件：</span>
            <div className="file-list">
              {reEditInvoiceUrls.map((url, i) => (
                <div key={i} className="file-chip">
                  <a href={url} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', textDecoration: 'none' }}>📎 发票_{i + 1}</a>
                </div>
              ))}
            </div>
          </div>
        )}
        <FileUploader file={null} setFile={() => {}} files={invoiceFiles} setFiles={(files) => { setInvoiceFiles(files); if (files.length > 0 && isReEdit) { setOcrResults([]); onClearReEdit?.(); } }}
          label={isReEdit ? "替换或追加发票（可选）" : "点击或拖拽上传发票（支持 PDF / 图片，可多选）"} accept=".pdf,.png,.jpg,.jpeg" hint="仅支持增值税普通发票，可一次选择多个文件" multiple />
        {invoiceFiles.length > 0 && ocrResults.length === 0 && (
          <button className="btn btn-primary" onClick={handleBatchOCR} disabled={ocrLoading} style={{ marginTop: 16 }}>
            {ocrLoading ? <><span className="spinner" /> 正在识别 {invoiceFiles.length} 张发票...</> : `🔍 开始识别 ${invoiceFiles.length} 张发票`}
          </button>
        )}
        {ocrError && <div className="alert alert-error" style={{ marginTop: 12 }}>{ocrError}</div>}
        {ocrResults.length > 0 && (
          <div style={{ marginTop: 16 }}>
            {ocrResults.map((result, idx) => (
              <div key={idx} style={{ padding: 16, marginBottom: 12, background: 'var(--gray-50)', borderRadius: 'var(--radius)' }}>
                <h3 style={{ fontSize: 15, marginBottom: 8 }}>📄 发票 {idx + 1}</h3>
                <div className="form-row">
                  <div><span className="form-label">购买方名称</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 14 }}>{result.buyer_name || '未识别'}</span>
                      {result.buyer_name && <span className={`badge ${result.buyer_name_valid ? 'badge-ok' : 'badge-warn'}`}>{result.buyer_name_valid ? '✓' : '⚠'}</span>}
                    </div>
                  </div>
                  <div><span className="form-label">纳税人识别号</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 14 }}>{result.buyer_tax_id || '未识别'}</span>
                      {result.buyer_tax_id && <span className={`badge ${result.buyer_tax_id_valid ? 'badge-ok' : 'badge-warn'}`}>{result.buyer_tax_id_valid ? '✓' : '⚠'}</span>}
                    </div>
                  </div>
                </div>
                <div className="form-row" style={{ marginTop: 8 }}>
                  <div><span className="form-label">开票日期</span><span style={{ fontSize: 14 }}>{result.invoice_date || '未识别'}</span></div>
                  <div><span className="form-label">发票总额</span><span style={{ fontSize: 14, fontWeight: 600 }}>¥{result.invoice_total.toFixed(2)}</span></div>
                </div>
                {result.items.length > 0 && (
                  <div style={{ marginTop: 8 }}><span className="form-label">识别到的明细项</span>
                    <table style={{ marginTop: 4 }}><thead><tr><th>物品名称</th><th>单价(税前)</th><th>数量</th><th>金额</th><th>税额</th></tr></thead>
                      <tbody>{result.items.map((item, i) => (<tr key={i}><td>{item.name}</td><td>¥{item.unit_price.toFixed(2)}</td><td>{item.quantity}</td><td>¥{item.amount.toFixed(2)}</td><td>¥{item.tax_amount.toFixed(2)}</td></tr>))}</tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
            <button className="btn btn-secondary" onClick={handleBatchOCR} disabled={ocrLoading} style={{ fontSize: 13 }}>重新识别全部发票</button>
          </div>
        )}
      </div>
      <div className="card">
        <h2 className="card-title">📷 上传活动凭证</h2>
        <p style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 12 }}>请上传至少 1 张活动现场照片</p>
        {reEditEvidenceUrls.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <span className="form-label">原有活动凭证：</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
              {reEditEvidenceUrls.map((url, i) => (
                <img key={i} src={url} alt={`凭证_${i + 1}`} style={{ width: 120, height: 90, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--gray-200)' }} />
              ))}
            </div>
          </div>
        )}
        <FileUploader file={null} setFile={() => {}} files={evidenceFiles} setFiles={setEvidenceFiles}
          label={isReEdit ? "替换或追加活动照片（可选）" : "点击或拖拽上传活动照片（至少 1 张）"} accept=".png,.jpg,.jpeg" hint="必须是活动现场照片" multiple />
      </div>
      <div className="btn-actions">
        <button className="btn btn-secondary" onClick={onHome}>← 返回首页</button>
        <button className="btn btn-primary" disabled={!canNext} onClick={onNext}>下一步：填写报销表 →</button>
      </div>
    </>
  );
}
