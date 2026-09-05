import { useState } from 'react';
import FileUploader from '../components/FileUploader';
import StepIndicator from '../components/StepIndicator';
import { OCRResult, OCRFileResult, ReimbursementType, MaterialKey } from '../types';
import { TYPE_MATERIALS, materialFor, SELECTABLE_TYPES, TAB_LABELS, typeColor } from '../config/materials';
import type { TypeMaterialsState, MaterialEntry } from '../App';
import { emptyMaterialEntry } from '../App';
import Icon from '../components/Icon';
import { useFeedback } from '../components/Feedback';
import RuleTips, { RuleTipItem } from '../components/RuleTips';

interface Props {
  materials: TypeMaterialsState;
  setMaterialFiles: (type: ReimbursementType, key: MaterialKey, files: File[]) => void;
  removeExistingFile: (type: ReimbursementType, key: MaterialKey, index: number) => void;
  ocrResults: Partial<Record<ReimbursementType, OCRResult[]>>;
  setOcrResults: (type: ReimbursementType, results: OCRResult[]) => void;
  ocrLoading: boolean;
  setOcrLoading: (v: boolean) => void;
  applyOCRResults: (type: ReimbursementType, results: OCRResult[], existingCount?: number) => void;
  onAddManualInvoice: (type: ReimbursementType) => void;
  invoiceSectionCounts: Partial<Record<ReimbursementType, number>>;
  onNext: () => void;
  onHome: () => void;
}

const entryFor = (materials: TypeMaterialsState, type: ReimbursementType, key: MaterialKey): MaterialEntry =>
  materials[type]?.[key] ?? emptyMaterialEntry();

const typeFileCount = (materials: TypeMaterialsState, type: ReimbursementType): number =>
  TYPE_MATERIALS[type].reduce((sum, k) => sum + entryFor(materials, type, k).files.length + entryFor(materials, type, k).existingUrls.length, 0);

/** 某类型是否有内容（上传文件/原有文件/手工发票区块） */
const typeHasContent = (materials: TypeMaterialsState, type: ReimbursementType, invoiceSectionCounts: Partial<Record<ReimbursementType, number>>): boolean =>
  typeFileCount(materials, type) > 0 || (invoiceSectionCounts[type] || 0) > 0;

/**
 * 「原有文件」区（仅重编辑会话出现）：head 行 = label 左 + 紫色编辑按钮右，下方 chips 行。
 * 编辑态下每张 chip 右上角出现 × 可删除；removable=false（发票文件数与报销区块数不一致，
 * 无法按序号安全删除）时 chips 不显示 ×，常驻展示引导文案（指向第 2 步删区块或整组重传替换）。
 * 编辑态为块内局部状态：随卡片卸载复位，删除过程中保持开启。
 */
function ExistingFilesBlock({ label, icon, urls, removable, onRemove }: {
  label: string;
  icon: string;
  urls: string[];
  /** false = 发票数量不一致态：chips 不可删 */
  removable: boolean;
  /** 已通过确认的删除请求（index 为当前列表下标） */
  onRemove: (index: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  if (urls.length === 0) return null;   // 删光后整块隐藏（含编辑按钮）
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="existing-files-head">
        <span className="form-label">原有文件：</span>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing(e => !e)}>
          <Icon name={editing ? 'check' : 'edit'} size={13} /> {editing ? '完成' : '编辑原有文件'}
        </button>
      </div>
      <div className="file-list">
        {urls.map((url, i) => (
          <div key={i} className={`file-chip${editing && removable ? ' file-chip--editable' : ''}`}>
            <a href={url} target="_blank" rel="noreferrer" className="file-link">
              <Icon name={icon} size={14} /> {label}_{i + 1}
            </a>
            {editing && removable && (
              <button type="button" className="file-chip-remove" aria-label={`删除${label}_${i + 1}`}
                      title={`删除${label}_${i + 1}`} onClick={() => onRemove(i)}>
                <Icon name="x" size={12} />
              </button>
            )}
          </div>
        ))}
      </div>
      {!removable && (
        <div className="existing-files-note">
          <Icon name="alert-triangle" size={13} />
          <span>{label}文件数与报销表区块数不一致，无法进入下一步。请在第 2 步「填写报销表」页删除多余的发票区块，或重新上传{label}并识别以整组替换。</span>
        </div>
      )}
    </div>
  );
}

/** 某类型是否满足全部材料数量要求 */
const typeComplete = (materials: TypeMaterialsState, type: ReimbursementType, invoiceSectionCounts: Partial<Record<ReimbursementType, number>>): boolean =>
  TYPE_MATERIALS[type].every(k => {
    const cfg = materialFor(type, k);
    const count = entryFor(materials, type, k).files.length + entryFor(materials, type, k).existingUrls.length;
    // 发票：区块必须与文件数严格对齐（识别 / 删除 / 手动补齐后自然满足）；
    // 新增未识别完、数量不一致（历史遗留）时禁止进入下一步，防文件与报销表数据错位
    if (k === 'invoices') return count > 0 && count === (invoiceSectionCounts[type] || 0);
    return count >= cfg.minCount;
  }) &&
  TYPE_MATERIALS[type].every(k => {
    const cfg = materialFor(type, k);
    const count = entryFor(materials, type, k).files.length + entryFor(materials, type, k).existingUrls.length;
    return cfg.maxCount === null || count <= cfg.maxCount;
  });

export default function UploadMaterials({
  materials,
  setMaterialFiles,
  removeExistingFile,
  ocrResults,
  setOcrResults,
  ocrLoading,
  setOcrLoading,
  applyOCRResults,
  onAddManualInvoice,
  invoiceSectionCounts,
  onNext,
  onHome,
}: Props) {
  const { toast, confirm } = useFeedback();
  const [activeType, setActiveType] = useState<ReimbursementType>('vat');
  const [ocrErrors, setOcrErrors] = useState<Partial<Record<ReimbursementType, string>>>({});

  // 重编辑场景：任一类型有原有文件
  const isReEdit = SELECTABLE_TYPES.some(t => TYPE_MATERIALS[t].some(k => entryFor(materials, t, k).existingUrls.length > 0 || entryFor(materials, t, k).existingPaths.length > 0));

  const handleBatchOCR = async () => {
    const invoiceEntry = entryFor(materials, activeType, 'invoices');
    const invoiceFiles = invoiceEntry.files;
    if (invoiceFiles.length === 0) return;
    setOcrLoading(true);
    setOcrErrors(p => ({ ...p, [activeType]: '' }));

    const form = new FormData();
    invoiceFiles.forEach(f => form.append('files', f));

    try {
      const resp = await fetch('/api/v1/ocr/invoices', { method: 'POST', body: form });
      const json = await resp.json();
      if (!json.success) { setOcrErrors(p => ({ ...p, [activeType]: '批量识别失败' })); return; }
      const results: OCRFileResult[] = json.results || [];
      const failed = results.filter(r => !r.success);
      if (failed.length > 0) setOcrErrors(p => ({ ...p, [activeType]: `${failed.length} 张发票识别失败：${failed.map(f => f.filename).join('、')}` }));
      const successResults: OCRResult[] = results.filter(r => r.success && r.data).map(r => r.data!);
      setOcrResults(activeType, successResults);
      // existingCount = 剩余原有发票数：区块与该数一致时保留原区块、新结果接尾（原有+新增一并进入报销表）
      applyOCRResults(activeType, successResults, invoiceEntry.existingUrls.length);
    } catch { setOcrErrors(p => ({ ...p, [activeType]: '网络错误，请检查后端是否启动' })); }
    finally { setOcrLoading(false); }
  };

  const handleSetFiles = (key: MaterialKey) => (files: File[]) => {
    const cfg = materialFor(activeType, key);
    let next = files;
    if (cfg.maxCount !== null && next.length > cfg.maxCount) {
      toast(`${cfg.label}最多上传 ${cfg.maxCount} 张`, 'warn');
      next = next.slice(0, cfg.maxCount);
    }
    setMaterialFiles(activeType, key, next);
    // 重编辑新增发票不再整组替换：原有文件保留，识别成功后由 applyOCRResults 保留原区块、新结果接尾
  };

  // 删除原有文件：统一先确认；发票额外提示联动删除对应区块并重算合计
  const handleRemoveExistingFile = async (key: MaterialKey, index: number) => {
    const cfg = materialFor(activeType, key);
    const isInvoice = key === 'invoices';
    const name = `${cfg.label}_${index + 1}`;
    const ok = await confirm({
      message: isInvoice
        ? `确定删除原有文件 ${name}？对应的报销区块（明细 / 金额 / 经手人）将一并删除，报销表合计同步更新。`
        : `确定删除原有文件 ${name}？仅移除本轮编辑对该文件的引用，不影响其它内容。`,
      tone: 'danger',
    });
    if (!ok) return;
    removeExistingFile(activeType, key, index);
    toast(isInvoice ? `已删除 ${name}，对应报销区块与合计已同步更新` : `已删除 ${name}`, 'success');
  };

  // 至少一个类型有内容，且每个有内容的类型满足全部材料要求
  const hasAnyContent = SELECTABLE_TYPES.some(t => typeHasContent(materials, t, invoiceSectionCounts));
  const canNext = hasAnyContent && SELECTABLE_TYPES.every(t => !typeHasContent(materials, t, invoiceSectionCounts) || typeComplete(materials, t, invoiceSectionCounts));

  const activeEntry = (key: MaterialKey) => entryFor(materials, activeType, key);
  const activeOCR = ocrResults[activeType] || [];
  const ocrError = ocrErrors[activeType] || '';

  // 提交规则提示：与《报销人提交规则提示.md》同步，按当前类型显示特例
  const ruleItems: RuleTipItem[] = [
    {
      text: activeType === 'travel'
        ? <>交通票据需为<strong>正规票据</strong>，小票、收据不可报销</>
        : <>发票必须是<strong>增值税普通发票</strong>，小票、收据不可报销</>,
    },
    {
      tone: 'warn',
      text: <>开票名称「香港中文大学（深圳）」勿漏"深圳"、税号 <strong>12440300066312613F</strong> 勿漏大写 F——OCR 会自动核对名称与税号，<strong>销售方盖章请自行确认</strong></>,
    },
    ...(activeType === 'travel' ? [{
      text: <>打车票据需备注"出发地-目的地 + 日期"，尽量使用滴滴；船票 / 高铁票保留票根原件，复印件备注起止地与日期一并提交；大巴 / 中巴 / 商务车需提前联系 OSA 老师预订</>,
    }] : []),
    ...(activeType === 'insurance' ? [{
      text: <>保险报销需同时上传<strong>发票与保险单原单</strong>，两者缺一不可</>,
    }] : []),
    ...(activeType === 'large' ? [{
      text: <>单项报销 <strong>≥1000 元</strong>的报销归属大额报销，需同时上传<strong>发票、供应商明细表单与支付凭证</strong></>,
    }] : []),
    {
      tone: 'warn',
      text: activeType === 'large'
        ? <>总额超 <strong>1 万元</strong>请提前联系 OSA 老师</>
        : <>单项报销 <strong>≥1000 元</strong>请选择「大额报销」类型提交（需附供应商明细表单与支付凭证）；总额超 <strong>1 万元</strong>请提前联系 OSA 老师</>,
    },
    {
      text: <>活动凭证需 1-2 张活动现场照片（海报 / 推送 / 邮件截图亦可）</>,
    },
  ];

  return (
    <>
      <StepIndicator current={1} />
      {isReEdit && (
        <div className="banner-purple">
          <Icon name="edit" size={16} />
          <span style={{ fontWeight: 600 }}>正在重新编辑被打回的报销申请</span>
          <span style={{ marginLeft: 12 }}>原有文件已保留，可删除或新增。新增发票识别后与原有一并进入报销表，不覆盖原有内容。</span>
        </div>
      )}

      {/* 类型标签页：一次报销可同时包含多种类型，切页不丢失已传材料 */}
      <div className="type-tabs" role="tablist" aria-label="报销类型">
        {SELECTABLE_TYPES.map(t => (
          <button key={t} role="tab" aria-selected={activeType === t}
                  className={`type-tab${activeType === t ? ' is-active' : ''}`}
                  style={{ '--accent': typeColor(t) } as React.CSSProperties}
                  onClick={() => setActiveType(t)}>
            <span>{TAB_LABELS[t]}</span>
            {typeFileCount(materials, t) > 0 && <span className="type-tab-count">{typeFileCount(materials, t)} 个文件</span>}
            {typeComplete(materials, t, invoiceSectionCounts) && <span className="badge badge-ok" style={{ marginLeft: 6 }}>✓</span>}
          </button>
        ))}
      </div>

      {/* 提交规则提示（首次进入默认展开，切换类型特例随之变化） */}
      <RuleTips title="提交规则提示" defaultOpen items={ruleItems} />

      {TYPE_MATERIALS[activeType].map(key => {
        const cfg = materialFor(activeType, key);
        const entry = activeEntry(key);
        const isInvoice = key === 'invoices';
        const isOCRInvoice = isInvoice && cfg.useOCR;
        const showManualAdd = isOCRInvoice && (activeType === 'travel' || ocrError !== '');

        return (
          <div className="card" key={key}>
            <h2 className="card-title"><Icon name={cfg.icon} size={18} /> 上传{cfg.label}</h2>
            <p className="card-sub" style={{ marginBottom: 12 }}>{cfg.hint}</p>
            {/* 原有文件区（重编辑会话；行末紫色小按钮进入编辑删除模式） */}
            <ExistingFilesBlock
              label={cfg.label} icon={cfg.icon} urls={entry.existingUrls}
              removable={!isInvoice || entry.existingUrls.length === (invoiceSectionCounts[activeType] || 0)}
              onRemove={(i) => void handleRemoveExistingFile(key, i)}
            />
            <FileUploader file={null} setFile={() => {}} files={entry.files} setFiles={handleSetFiles(key)}
              label={isReEdit ? "新增上传（可选）" : `点击或拖拽上传${cfg.label}（可多选）`} accept={cfg.accept} hint={cfg.hint} multiple />

            {isOCRInvoice && entry.files.length > 0 && activeOCR.length === 0 && (
              <button className="btn btn-primary" onClick={handleBatchOCR} disabled={ocrLoading} style={{ marginTop: 16 }}>
                {ocrLoading ? <><span className="spinner" /> 正在识别 {entry.files.length} 张发票...</> : <><Icon name="search" size={15} /> 开始识别 {entry.files.length} 张发票</>}
              </button>
            )}
            {isOCRInvoice && ocrError && <div className="alert alert-error" style={{ marginTop: 12 }}>{ocrError}</div>}
            {isOCRInvoice && (() => {
              const diff = (invoiceSectionCounts[activeType] || 0) - (entry.files.length + entry.existingUrls.length);
              if (diff === 0) return null;
              return (
                <div className="alert alert-warn" style={{ marginTop: 12 }}>
                  <Icon name="alert-triangle" size={15} />
                  <span>{cfg.label}文件数（{entry.files.length + entry.existingUrls.length}）与报销区块数（{invoiceSectionCounts[activeType] || 0}）不一致，无法进入下一步：
                    {diff < 0 ? <>请完成新增{cfg.label}的识别（失败的可手动添加补录），或移除多余文件后再试</> : <>请在第 2 步「填写报销表」页删除多余的发票区块，或补充上传{cfg.label}</>}
                  </span>
                </div>
              );
            })()}
            {isOCRInvoice && showManualAdd && (
              <button className="btn btn-secondary btn-sm" onClick={() => onAddManualInvoice(activeType)} style={{ marginTop: 12 }}>
                <Icon name="edit" size={14} /> 手动添加{cfg.label}（不识别，在下一步填写）
              </button>
            )}
            {isOCRInvoice && activeOCR.length > 0 && (
              <div style={{ marginTop: 16 }}>
                {activeOCR.map((result, idx) => (
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
