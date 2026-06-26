import React, { useRef, useState } from "react";
import { parseExcelFile } from "./parseExcel.js";

export function ExcelImport({ onLoad }) {
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef();

  async function handle(file) {
    if (!file) return;
    if (!/\.(xlsx|xls|xlsm|csv)$/i.test(file.name)) {
      setError("Please select an Excel (.xlsx / .xls) or CSV file.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await parseExcelFile(file);
      onLoad({ ...result, fileName: file.name });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    handle(e.dataTransfer.files[0]);
  }

  return (
    <div className="import-wrap">
      <div className="import-logo">📊</div>
      <h2>Ticket Analytics Dashboard</h2>
      <p className="import-sub">Drop your Excel workbook or click to pick a file</p>

      <div
        className={"drop-zone" + (dragging ? " dragging" : "")}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current.click()}
      >
        {loading ? (
          <span className="dz-icon">⏳</span>
        ) : (
          <>
            <span className="dz-icon">📂</span>
            <p className="dz-label">Drag & drop your <strong>.xlsx</strong> here<br />or <u>click to browse</u></p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.xlsm,.csv"
          style={{ display: "none" }}
          onChange={(e) => handle(e.target.files[0])}
        />
      </div>

      {error && <div className="import-error">⚠️ {error}</div>}

      <div className="import-hint">
        <strong>Required columns (any order, case-insensitive):</strong><br />
        Key · Summary · Assignee · Priority · Status · Issue Type · Combination · Resolution Days
      </div>
    </div>
  );
}

export function ChangeFileBar({ fileName, sheet, warnings, onReset }) {
  return (
    <div className="file-bar">
      <span>📄 <strong>{fileName}</strong> · sheet: <em>{sheet}</em></span>
      <button className="btn-sm" onClick={onReset}>↩ Change file</button>
      {warnings && warnings.length > 0 && (
        <div className="warn-row">
          {warnings.map((w, i) => <span key={i} className="warn-chip">⚠️ {w}</span>)}
        </div>
      )}
    </div>
  );
}
