import { useState, useCallback } from 'react';
import StepIndicator from './components/StepIndicator';
import UploadMaterials from './pages/UploadMaterials';
import FillForm from './pages/FillForm';
import ReviewSubmit from './pages/ReviewSubmit';
import {
  OCRResult,
  ReimbursementFormData,
  InvoiceSection,
  DetailRow,
  Step,
} from './types';

function makeEmptyInvoice(): InvoiceSection {
  return {
    buyer_name: '',
    buyer_tax_id: '',
    buyer_name_valid: false,
    buyer_tax_id_valid: false,
    invoice_date: '',
    invoice_total: 0,
    reimbursement_amount: 0,
    handler: '',
    items: [
      {
        name: '', unit_price: 0, quantity: 1, amount: 0,
        purchase_channel: '', reusable: '',
        source_invoice_item: false,
      },
    ],
  };
}

const emptyForm: ReimbursementFormData = {
  activity_name: '',
  org_name: '',
  activity_end_date: '',
  reimbursement_date: new Date().toISOString().slice(0, 10),
  invoices: [makeEmptyInvoice()],
  actual_total: 0,
  finance_officer: '',
  activity_leader_opinion: '',
  alipay_account: '',
};

export default function App() {
  const [step, setStep] = useState<Step>(1);
  const [ocrResults, setOcrResults] = useState<OCRResult[]>([]);
  const [formData, setFormData] = useState<ReimbursementFormData>(emptyForm);
  const [invoiceFiles, setInvoiceFiles] = useState<File[]>([]);
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [submitResult, setSubmitResult] = useState<{
    message: string;
    zip_filename: string;
  } | null>(null);

  const updateForm = useCallback((patch: Partial<ReimbursementFormData>) => {
    setFormData(prev => ({ ...prev, ...patch }));
  }, []);

  /** 更新某张发票的数据 */
  const updateInvoice = useCallback((invIndex: number, patch: Partial<InvoiceSection>) => {
    setFormData(prev => {
      const invoices = [...prev.invoices];
      invoices[invIndex] = { ...invoices[invIndex], ...patch };
      return { ...prev, invoices };
    });
  }, []);

  /** 更新某张发票的明细行 */
  const updateInvoiceItems = useCallback((invIndex: number, items: DetailRow[]) => {
    setFormData(prev => {
      const invoices = [...prev.invoices];
      invoices[invIndex] = { ...invoices[invIndex], items };

      // 合计 = 所有发票报销金额之和
      let total = 0;
      for (const inv of invoices) {
        total += inv.reimbursement_amount || 0;
      }

      return { ...prev, invoices, actual_total: total };
    });
  }, []);

  /** 从OCR结果自动构建发票区块并填入表单 */
  const applyOCRResults = useCallback((results: OCRResult[]) => {
    if (results.length === 0) return;

    const invoices: InvoiceSection[] = results.map(r => ({
      buyer_name: r.buyer_name,
      buyer_tax_id: r.buyer_tax_id,
      buyer_name_valid: r.buyer_name_valid,
      buyer_tax_id_valid: r.buyer_tax_id_valid,
      invoice_date: r.invoice_date,
      invoice_total: r.invoice_total,
      reimbursement_amount: 0,
      handler: '',
      items: r.items.length > 0
        ? r.items.map(item => ({
            name: item.name,
            unit_price: item.unit_price,
            quantity: item.quantity,
            amount: item.amount,
            purchase_channel: '',
            reusable: '',
            source_invoice_item: true,
          }))
        : [{
            name: '', unit_price: 0, quantity: 1, amount: 0,
            purchase_channel: '', reusable: '',
            source_invoice_item: false,
          }],
    }));

    let total = 0;
    for (const inv of invoices) {
      total += inv.reimbursement_amount || 0;
    }

    setFormData(prev => ({
      ...prev,
      invoices,
      actual_total: total,
    }));
  }, []);

  const handleBack = () => setStep(prev => Math.max(1, prev - 1) as Step);

  return (
    <>
      <StepIndicator current={step} />

      {step === 1 && (
        <UploadMaterials
          invoiceFiles={invoiceFiles}
          setInvoiceFiles={setInvoiceFiles}
          evidenceFiles={evidenceFiles}
          setEvidenceFiles={setEvidenceFiles}
          ocrResults={ocrResults}
          setOcrResults={setOcrResults}
          ocrLoading={ocrLoading}
          setOcrLoading={setOcrLoading}
          applyOCRResults={applyOCRResults}
          onNext={() => setStep(2)}
        />
      )}

      {step === 2 && (
        <FillForm
          formData={formData}
          updateForm={updateForm}
          updateInvoice={updateInvoice}
          updateInvoiceItems={updateInvoiceItems}
          onBack={handleBack}
          onNext={() => setStep(3)}
        />
      )}

      {step === 3 && (
        <ReviewSubmit
          formData={formData}
          invoiceFiles={invoiceFiles}
          evidenceFiles={evidenceFiles}
          submitResult={submitResult}
          setSubmitResult={setSubmitResult}
          onBack={handleBack}
          onReset={() => {
            setStep(1);
            setFormData(emptyForm);
            setOcrResults([]);
            setInvoiceFiles([]);
            setEvidenceFiles([]);
            setSubmitResult(null);
          }}
        />
      )}
    </>
  );
}
