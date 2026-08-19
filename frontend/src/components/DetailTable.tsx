import { DetailRow } from '../types';
import Icon from './Icon';

interface Props {
  items: DetailRow[];
  onChange: (items: DetailRow[]) => void;
  invoiceTotal: number;
  actualTotal: number;
  readonly?: boolean;
  /** 允许负数单价（仅出行类报销，如退票差价） */
  allowNegativePrice?: boolean;
}

const CHANNEL_OPTIONS = ['', '网购', '实体店'];
const REUSABLE_OPTIONS = ['', '是', '否'];

export default function DetailTable({
  items,
  onChange,
  invoiceTotal,
  actualTotal,
  readonly = false,
  allowNegativePrice = false,
}: Props) {
  const updateRow = (index: number, field: keyof DetailRow, value: string | number | boolean) => {
    const updated = items.map((row, i) =>
      i === index ? { ...row, [field]: value } : row
    );
    onChange(updated);
  };

  const addRow = () => {
    onChange([
      ...items,
      {
        name: '',
        unit_price: 0,
        quantity: 1,
        amount: 0,
        purchase_channel: '网购',
        reusable: '否',
        source_invoice_item: false,
      },
    ]);
  };

  const removeRow = (index: number) => {
    if (items.length <= 1) return;
    onChange(items.filter((_, i) => i !== index));
  };

  return (
    <div>
      <div className="table-wrapper">
        <table className="detail-table">
          <thead>
            <tr>
              <th>用途/物品名称</th>
              <th>购买途径</th>
              <th>可重复利用</th>
              <th>单价(税前)</th>
              <th>数量</th>
              <th>小计</th>
              {!readonly && <th></th>}
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => {
              const subtotal = (item.unit_price || 0) * (item.quantity || 0);
              return (
                <tr key={i}>
                  <td>
                    {readonly ? (
                      item.name || '—'
                    ) : (
                      <input
                        value={item.name}
                        onChange={e => updateRow(i, 'name', e.target.value)}
                        placeholder="输入物品名称"
                      />
                    )}
                  </td>
                  <td>
                    {readonly ? (
                      item.purchase_channel || '—'
                    ) : (
                      <select
                        value={item.purchase_channel}
                        onChange={e => updateRow(i, 'purchase_channel', e.target.value)}
                      >
                        {CHANNEL_OPTIONS.map(o => (
                          <option key={o} value={o}>
                            {o || '请选择'}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td>
                    {readonly ? (
                      item.reusable || '—'
                    ) : (
                      <select
                        value={item.reusable}
                        onChange={e => updateRow(i, 'reusable', e.target.value)}
                      >
                        {REUSABLE_OPTIONS.map(o => (
                          <option key={o} value={o}>
                            {o || '请选择'}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td>
                    {readonly ? (
                      item.unit_price.toFixed(2)
                    ) : (
                      <input
                        type="number"
                        step="0.01"
                        min={allowNegativePrice ? undefined : "0"}
                        title={allowNegativePrice ? '可填写负数单价（如退票差价）' : undefined}
                        value={item.unit_price || ''}
                        onChange={e =>
                          updateRow(i, 'unit_price', parseFloat(e.target.value) || 0)
                        }
                      />
                    )}
                  </td>
                  <td>
                    {readonly ? (
                      item.quantity
                    ) : (
                      <input
                        type="number"
                        step="1"
                        min="1"
                        value={item.quantity || ''}
                        onChange={e =>
                          updateRow(i, 'quantity', parseInt(e.target.value) || 0)
                        }
                      />
                    )}
                  </td>
                  <td className="table-num" style={{ fontWeight: 500 }}>
                    ¥{subtotal.toFixed(2)}
                  </td>
                  {!readonly && (
                    <td>
                      <button
                        className="btn-row-remove"
                        onClick={() => removeRow(i)}
                        disabled={items.length <= 1}
                        title="删除此行"
                      >
                        <Icon name="x" size={14} />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!readonly && (
        <button className="btn-row-add" onClick={addRow}>
          <Icon name="plus" size={14} /> 添加一行
        </button>
      )}

      <div className="table-total">
        实际花费合计：¥{actualTotal.toFixed(2)}
        {invoiceTotal > 0 && (
          <span className="table-note" style={{ marginLeft: 16 }}>
            （发票总额：¥{invoiceTotal.toFixed(2)}）
          </span>
        )}
      </div>
    </div>
  );
}
