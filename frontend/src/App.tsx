import { useState, useCallback, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import HomePage from './pages/HomePage';
import UploadMaterials from './pages/UploadMaterials';
import FillForm from './pages/FillForm';
import ReviewSubmit from './pages/ReviewSubmit';
import {
  OCRResult,
  ReimbursementFormData,
  InvoiceSection,
  DetailRow,
} from './types';

function makeEmptyInvoice(): InvoiceSection {
  return {
    buyer_name: '', buyer_tax_id: '',
    buyer_name_valid: false, buyer_tax_id_valid: false,
    invoice_date: '', invoice_total: 0,
    reimbursement_amount: 0, handler: '',
    items: [{
      name: '', unit_price: 0, quantity: 1, amount: 0,
      purchase_channel: '', reusable: '', source_invoice_item: false,
    }],
  };
}

const emptyForm: ReimbursementFormData = {
  activity_name: '', org_name: '',
  activity_end_date: '',
  reimbursement_date: new Date().toISOString().slice(0, 10),
  invoices: [makeEmptyInvoice()],
  actual_total: 0,
  finance_officer: '', activity_leader_opinion: '', alipay_account: '',
};

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();

  const [ocrResults, setOcrResults] = useState<OCRResult[]>([]);
  const [formData, setFormData] = useState<ReimbursementFormData>(emptyForm);
  const [invoiceFiles, setInvoiceFiles] = useState<File[]>([]);
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [submitResult, setSubmitResult] = useState<{
    message: string; zip_filename: string;
  } | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);

  // 重置所有状态
  const resetAll = useCallback(() => {
    setFormData(emptyForm);
    setOcrResults([]);
    setInvoiceFiles([]);
    setEvidenceFiles([]);
    setSubmitResult(null);
    setDraftId(null);
  }, []);

  // 保存草稿
  const saveDraft = useCallback(async () => {
    try {
      const payload = {
        draft_id: draftId,
        activity_name: formData.activity_name,
        org_name: formData.org_name,
        current_step: location.pathname.includes('fill') ? 2 : location.pathname.includes('review') ? 3 : 1,
        form_data: formData,
        ocr_results: ocrResults,
      };
      const r = await fetch('/api/v1/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (j.success) setDraftId(j.draft_id);
      return j.success;
    } catch {
      return false;
    }
  }, [formData, ocrResults, draftId, location.pathname]);

  // 恢复草稿
  const restoreDraft = useCallback((draft: any) => {
    setFormData(draft.form_data || emptyForm);
    setOcrResults(draft.ocr_results || []);
    setDraftId(draft.id);
    setSubmitResult(null);
    const step = draft.current_step || 1;
    if (step === 1) navigate('/reimbursement/upload');
    else if (step === 2) navigate('/reimbursement/fill');
    else navigate('/reimbursement/review');
  }, [navigate]);

  // 监听草稿恢复事件
  useEffect(() => {
    const handler = (e: Event) => restoreDraft((e as CustomEvent).detail);
    window.addEventListener('restore-draft', handler);
    return () => window.removeEventListener('restore-draft', handler);
  }, [restoreDraft]);

  // 离开前提示
  useEffect(() => {
    const isWizard = location.pathname.startsWith('/reimbursement');
    const handler = (e: BeforeUnloadEvent) => {
      if (isWizard && formData.activity_name) e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [location.pathname, formData.activity_name]);

  const updateForm = useCallback((patch: Partial<ReimbursementFormData>) => {
    setFormData(prev => ({ ...prev, ...patch }));
  }, []);

  const updateInvoice = useCallback((invIndex: number, patch: Partial<InvoiceSection>) => {
    setFormData(prev => {
      const invoices = [...prev.invoices];
      invoices[invIndex] = { ...invoices[invIndex], ...patch };
      return { ...prev, invoices };
    });
  }, []);

  const updateInvoiceItems = useCallback((invIndex: number, items: DetailRow[]) => {
    setFormData(prev => {
      const invoices = [...prev.invoices];
      invoices[invIndex] = { ...invoices[invIndex], items };
      let total = 0;
      for (const inv of invoices) total += inv.reimbursement_amount || 0;
      return { ...prev, invoices, actual_total: total };
    });
  }, []);

  const applyOCRResults = useCallback((results: OCRResult[]) => {
    if (results.length === 0) return;
    const invoices: InvoiceSection[] = results.map(r => ({
      buyer_name: r.buyer_name, buyer_tax_id: r.buyer_tax_id,
      buyer_name_valid: r.buyer_name_valid, buyer_tax_id_valid: r.buyer_tax_id_valid,
      invoice_date: r.invoice_date, invoice_total: r.invoice_total,
      reimbursement_amount: 0, handler: '',
      items: r.items.length > 0
        ? r.items.map(item => ({
            name: item.name, unit_price: item.unit_price,
            quantity: item.quantity, amount: item.amount,
            purchase_channel: '', reusable: '', source_invoice_item: true,
          }))
        : [{ name: '', unit_price: 0, quantity: 1, amount: 0,
             purchase_channel: '', reusable: '', source_invoice_item: false }],
    }));
    let total = 0;
    for (const inv of invoices) total += inv.reimbursement_amount || 0;
    setFormData(prev => ({ ...prev, invoices, actual_total: total }));
  }, []);

  // 回到首页时的草稿提示
  const promptSaveBeforeHome = useCallback(async () => {
    if (formData.activity_name || formData.org_name) {
      const ok = window.confirm('是否将当前进度保存为草稿？\n\n[确定] = 保存草稿\n[取消] = 不保存直接退出');
      if (ok) await saveDraft();
    }
    navigate('/');
  }, [formData, saveDraft, navigate]);

  return (
    <Routes>
      <Route path="/" element={
        <HomePage
          onEnterVat={() => { resetAll(); navigate('/reimbursement/upload'); }}
          onOpenDrafts={() => {}}
          onOpenHistory={() => {}}
        />
      } />
      <Route path="/reimbursement/upload" element={
        <UploadMaterials
          invoiceFiles={invoiceFiles} setInvoiceFiles={setInvoiceFiles}
          evidenceFiles={evidenceFiles} setEvidenceFiles={setEvidenceFiles}
          ocrResults={ocrResults} setOcrResults={setOcrResults}
          ocrLoading={ocrLoading} setOcrLoading={setOcrLoading}
          applyOCRResults={applyOCRResults}
          onNext={() => navigate('/reimbursement/fill')}
          onHome={promptSaveBeforeHome}
        />
      } />
      <Route path="/reimbursement/fill" element={
        <FillForm
          formData={formData} updateForm={updateForm}
          updateInvoice={updateInvoice} updateInvoiceItems={updateInvoiceItems}
          ocrResults={ocrResults}
          onBack={() => navigate('/reimbursement/upload')}
          onNext={() => navigate('/reimbursement/review')}
          onSaveDraft={saveDraft}
          onHome={promptSaveBeforeHome}
        />
      } />
      <Route path="/reimbursement/review" element={
        <ReviewSubmit
          formData={formData} invoiceFiles={invoiceFiles}
          evidenceFiles={evidenceFiles}
          submitResult={submitResult} setSubmitResult={setSubmitResult}
          onBack={() => navigate('/reimbursement/fill')}
          onSaveDraft={saveDraft}
          onHome={promptSaveBeforeHome}
          onReset={() => { resetAll(); navigate('/'); }}
        />
      } />
    </Routes>
  );
}
