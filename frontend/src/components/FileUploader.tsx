import { useRef } from 'react';
import Icon from './Icon';

interface Props {
  file: File | null;
  setFile: (f: File | null) => void;
  label: string;
  accept: string;
  hint: string;
  multiple?: boolean;
  files?: File[];
  setFiles?: (files: File[]) => void;
}

export default function FileUploader({
  file,
  setFile,
  label,
  accept,
  hint,
  multiple = false,
  files = [],
  setFiles,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => inputRef.current?.click();

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (!selected || selected.length === 0) return;

    if (multiple && setFiles) {
      setFiles([...files, ...Array.from(selected)]);
    } else {
      setFile(selected[0]);
    }
    // reset so re-selecting same file works
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files;
    if (!dropped || dropped.length === 0) return;

    if (multiple && setFiles) {
      setFiles([...files, ...Array.from(dropped)]);
    } else {
      setFile(dropped[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const removeSingle = () => setFile(null);

  const removeMulti = (index: number) => {
    if (setFiles) {
      setFiles(files.filter((_, i) => i !== index));
    }
  };

  const hasContent = multiple ? files.length > 0 : file !== null;

  return (
    <div>
      <div
        className={`upload-zone ${hasContent ? 'has-file' : ''}`}
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        <div className="upload-icon">
          {hasContent ? <Icon name="check" size={22} /> : <Icon name="paperclip" size={22} />}
        </div>
        <div className="upload-text">
          {hasContent
            ? multiple
              ? `已选择 ${files.length} 个文件（点击或拖拽添加更多）`
              : file?.name
            : label}
        </div>
        <div className="upload-hint">{hint}</div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleChange}
        className="visually-hidden"
      />

      {/* File chips for multi-upload */}
      {multiple && files.length > 0 && (
        <div className="file-list">
          {files.map((f, i) => (
            <div key={i} className="file-chip">
              <span><Icon name="file-text" size={14} /> {f.name}</span>
              <button className="remove-btn" aria-label="移除" onClick={() => removeMulti(i)}>
                <Icon name="x" size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Remove button for single upload */}
      {!multiple && file && (
        <div className="file-list">
          <div className="file-chip">
            <span>{file.name}</span>
            <button className="remove-btn" aria-label="移除" onClick={removeSingle}><Icon name="x" size={14} /></button>
          </div>
        </div>
      )}
    </div>
  );
}
