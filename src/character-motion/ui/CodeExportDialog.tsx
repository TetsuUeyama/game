"use client";

import { useCallback, useState } from "react";

interface CodeExportDialogProps {
  code: string;
  onClose: () => void;
}

export function CodeExportDialog({ code, onClose }: CodeExportDialogProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [code]);

  return (
    <div style={overlayStyle}>
      <div style={dialogStyle}>
        <div style={headerStyle}>
          <span style={{ fontWeight: "bold" }}>Generated Code</span>
          <button onClick={onClose} style={closeButtonStyle}>x</button>
        </div>
        <textarea
          readOnly
          value={code}
          style={textareaStyle}
        />
        <div style={footerStyle}>
          <button onClick={handleCopy} style={copyButtonStyle}>
            {copied ? "Copied!" : "Copy"}
          </button>
          <button onClick={onClose} style={cancelButtonStyle}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  top: 0, left: 0, right: 0, bottom: 0,
  background: "rgba(0,0,0,0.6)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

const dialogStyle: React.CSSProperties = {
  background: "#1e1e1e",
  borderRadius: 8,
  width: "min(700px, 90vw)",
  maxHeight: "80vh",
  display: "flex",
  flexDirection: "column",
  border: "1px solid #444",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "12px 16px",
  borderBottom: "1px solid #444",
  color: "#ddd",
};

const closeButtonStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#999",
  fontSize: 18,
  cursor: "pointer",
  padding: "0 4px",
};

const textareaStyle: React.CSSProperties = {
  flex: 1,
  margin: "12px 16px",
  padding: 12,
  background: "#111",
  color: "#d4d4d4",
  border: "1px solid #333",
  borderRadius: 4,
  fontFamily: "'Consolas', 'Courier New', monospace",
  fontSize: 12,
  lineHeight: 1.5,
  resize: "none",
  minHeight: 300,
};

const footerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  padding: "8px 16px 12px",
};

const copyButtonStyle: React.CSSProperties = {
  padding: "6px 16px",
  background: "#0078d4",
  color: "white",
  border: "none",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 13,
};

const cancelButtonStyle: React.CSSProperties = {
  padding: "6px 16px",
  background: "#333",
  color: "#ddd",
  border: "1px solid #555",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 13,
};
