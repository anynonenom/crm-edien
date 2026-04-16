/**
 * ContractTab — EIDEN GROUP NDA & Code of Conduct e-Sign
 * Integrated into Eiden BMS
 */
import React, { useRef, useEffect, useState, useCallback } from "react";
import { jsPDF } from "jspdf";
import { FileText, Download, RotateCcw, CheckCircle2, AlertTriangle } from "lucide-react";

interface ContractTabProps {
  currentUserName?: string;
}

const AGREEMENT_SECTIONS = [
  {
    title: "PART I: NON‑DISCLOSURE AGREEMENT (NDA)",
    content: [
      {
        heading: "Overview",
        text: 'EIDEN GROUP / EIDEN SARL, with registered address at Bloc B - B101 - Technopole 1 Agadir Bay, Morocco (the "Company"), and the undersigned individual ("Team Member") agree as follows:',
      },
      {
        heading: "1. Confidential Information",
        text: 'Includes all non‑public information relating to the Company\'s business, including but not limited to: internal systems, software frameworks, proprietary code, algorithms, web applications, client/customer data, financial records, strategic plans, trade secrets, methodologies, and any information disclosed in the Internal Code of Conduct.',
      },
      {
        heading: "2. Obligations",
        text: "Team Member shall: (a) hold Confidential Information in strict confidence; (b) not disclose it to any third party without written consent; (c) use it solely for authorized Company purposes; (d) protect it with at least reasonable care; (e) not copy, transfer, or retain any Company systems, data, or client information outside authorized channels.",
      },
      {
        heading: "3. Return of Property & Survival",
        text: "Upon termination, all Company property and copies must be returned. Confidentiality obligations survive termination indefinitely. Breach may result in immediate termination and legal remedies.",
      },
    ],
  },
  {
    title: "PART II: INTERNAL CODE OF CONDUCT",
    content: [
      {
        heading: "Our Identity",
        text: "EIDEN is built on innovation, ambition, and shared success. We are an organization driven by purpose, discipline, and relentless growth. This Code represents our commitment to excellence and to each other.",
      },
      {
        heading: "The Leadership Principles",
        text: "1. Lead by Example, Not by Force – Great leaders inspire through action. Micromanagement has no place; accountability and ownership do.\n2. Embrace Calculated Risk and Innovation – Bold thinking and creative solutions are our competitive edge.\n3. Hunger for Success and Continuous Learning – Ambition drives us. We invest in learning; complacency is the enemy.\n4. Order Over Chaos, Always – Discipline, structure, and systematic execution accelerate momentum.\n5. Shared Vision, Collective Achievement – We win together. Collaboration and alignment are non‑negotiable.",
      },
      {
        heading: "Core Commitments",
        text: "• Respect for Our Vision – Every decision should honor EIDEN's vision.\n• Respect for Our People – Dignity, fairness, and respect for all. Discrimination or harassment will not be tolerated.\n• Confidentiality and Integrity – What happens within EIDEN stays within EIDEN. Breach of trust leads to immediate termination.",
      },
      {
        heading: "Work Schedule and Attendance",
        text: "• Office Hours: Mon–Thu arrive 10:00 AM (work begins 10:30) – 5:00 PM; Friday remote 3:00–6:00 PM (subject to workload).\n• Time Tracking: Clock in/out via Jibble; select appropriate activity. Failure leads to disciplinary meeting.\n• Attendance Standards: >4 unjustified absences or >5 delays/month → disciplinary action.",
      },
      {
        heading: "Work Focus and Personal Development",
        text: "• 90/10 Rule: 90% focus on EIDEN work, 10% on personal projects/professional development (must not interfere with deliverables).\n• Phone Usage Policy: Limited to essential communication. Excessive use triggers one‑on‑one discussion.",
      },
      {
        heading: "Equipment and Resources",
        text: "Respect company property; office equipment for professional use only. Report damages immediately. Misuse may incur financial liability.",
      },
      {
        heading: "Performance and Accountability",
        text: "• KPIs: Clearly defined and aligned with EIDEN's objectives. Regular reviews; failure triggers action plan; persistent underperformance leads to termination.\n• Weekly Reporting: Every Friday submit report covering completed work, blockers, and pending tasks.",
      },
      {
        heading: "Collaboration and Communication",
        text: "Open, honest dialogue; constructive conflict resolution; celebrate wins together.",
      },
      {
        heading: "Work Environment and Culture",
        text: "Flexibility with discipline; balance and well‑being; fun and connection.",
      },
      {
        heading: "Disciplinary Process",
        text: "1. Verbal Warning → 2. Written Warning → 3. Final Warning → 4. Termination.",
      },
      {
        heading: "Signature and Commitment",
        text: "By signing below, I acknowledge that I have read, understood, and agree to uphold this Internal Code of Conduct and the NDA. I commit to representing EIDEN GROUP with integrity, ambition, and respect.",
      },
    ],
  },
];

function isValidCIN(cin: string) {
  return /^[A-Z]{1,2}[0-9]{4,}$/.test(cin.trim().toUpperCase());
}

export default function ContractTab({ currentUserName }: ContractTabProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  const [fullName, setFullName] = useState(currentUserName ?? "");
  const [cin, setCin] = useState("");
  const [cinError, setCinError] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [status, setStatus] = useState<{ type: "idle" | "success" | "error"; text: string }>({ type: "idle", text: "" });
  const [generating, setGenerating] = useState(false);

  // ── Canvas init ──────────────────────────────────────────────────────────────
  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#0b1e33";
  }, []);

  useEffect(() => { initCanvas(); }, [initCanvas]);

  function getCoords(e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    let clientX: number, clientY: number;
    if ("touches" in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    return {
      x: Math.max(0, Math.min(canvas.width, (clientX - rect.left) * scaleX)),
      y: Math.max(0, Math.min(canvas.height, (clientY - rect.top) * scaleY)),
    };
  }

  function handlePointerDown(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const coords = getCoords(e, canvas);
    setIsDrawing(true);
    lastPos.current = coords;
    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
  }

  function handlePointerMove(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const coords = getCoords(e, canvas);
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
    lastPos.current = coords;
  }

  function handlePointerUp(e?: React.MouseEvent | React.TouchEvent) {
    e?.preventDefault();
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.beginPath();
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function isSignatureEmpty() {
    const canvas = canvasRef.current;
    if (!canvas) return true;
    const ctx = canvas.getContext("2d");
    if (!ctx) return true;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] !== 255 || data[i + 1] !== 255 || data[i + 2] !== 255) return false;
    }
    return true;
  }

  // ── PDF Generation ───────────────────────────────────────────────────────────
  async function generatePDF() {
    const name = fullName.trim();
    if (!name) { setStatus({ type: "error", text: "Please enter your full name." }); return; }
    const cinRaw = cin.trim();
    if (!cinRaw) { setStatus({ type: "error", text: "CIN is required (Moroccan National ID)." }); return; }
    if (!isValidCIN(cinRaw)) { setStatus({ type: "error", text: "CIN format invalid. Expected letter(s) followed by digits (e.g., AB123456)." }); return; }
    if (isSignatureEmpty()) { setStatus({ type: "error", text: "Please provide your signature by drawing in the pad." }); return; }
    if (!confirmed) { setStatus({ type: "error", text: "You must confirm that you agree to the terms." }); return; }

    const cinUpper = cinRaw.toUpperCase();
    setGenerating(true);
    setStatus({ type: "idle", text: "" });

    try {
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 16;
      const usableW = pageW - margin * 2;
      let y = margin;

      // ── Color helpers
      const darkBlue: [number, number, number] = [11, 30, 51];
      const midBlue: [number, number, number] = [30, 58, 95];
      const grayText: [number, number, number] = [90, 104, 120];
      const black: [number, number, number] = [18, 22, 28];

      function checkPage(needed = 8) {
        if (y + needed > pageH - 18) { doc.addPage(); y = margin; }
      }

      function writeLine(
        text: string,
        fontSize: number,
        color: [number, number, number],
        bold: boolean,
        indent = 0,
        lineH?: number
      ) {
        doc.setFontSize(fontSize);
        doc.setFont("helvetica", bold ? "bold" : "normal");
        doc.setTextColor(...color);
        const lh = lineH ?? fontSize * 0.45;
        const lines = doc.splitTextToSize(text, usableW - indent);
        for (const line of lines) {
          checkPage(lh + 2);
          doc.text(line, margin + indent, y);
          y += lh;
        }
        return y;
      }

      // ── Header band
      doc.setFillColor(...darkBlue);
      doc.rect(0, 0, pageW, 28, "F");
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text("EIDEN GROUP", margin, 12);
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "normal");
      doc.text("Bloc B - B101 · Technopole 1 Agadir Bay, Morocco", margin, 19);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text("NON-DISCLOSURE AGREEMENT & INTERNAL CODE OF CONDUCT", margin, 25);
      y = 36;

      // ── Intro line
      writeLine("Electronically signed document — legally binding under Moroccan law", 8, grayText, false);
      y += 2;

      // ── Divider
      doc.setDrawColor(180, 195, 210);
      doc.setLineWidth(0.4);
      doc.line(margin, y, pageW - margin, y);
      y += 6;

      // ── Sections
      for (const section of AGREEMENT_SECTIONS) {
        checkPage(14);
        // Section title bar
        doc.setFillColor(235, 240, 247);
        doc.rect(margin, y - 4, usableW, 9, "F");
        writeLine(section.title, 10.5, darkBlue, true);
        y += 2;

        for (const block of section.content) {
          checkPage(12);
          writeLine(block.heading, 9, midBlue, true, 0, 4.8);
          y += 0.5;
          writeLine(block.text, 8.5, black, false, 2, 4.2);
          y += 3;
        }
        y += 2;
      }

      // ── Signature certificate block
      checkPage(60);
      doc.setDrawColor(160, 175, 195);
      doc.setLineWidth(0.5);
      doc.line(margin, y, pageW - margin, y);
      y += 7;

      doc.setFillColor(247, 249, 252);
      const certStartY = y - 3;

      writeLine("SIGNATURE CERTIFICATE", 11, darkBlue, true);
      y += 2;

      const today = new Date();
      const dateStr = today.toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" });

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...black);

      // Info table
      const infoLines: [string, string][] = [
        ["Full Name", name],
        ["CIN (Moroccan ID)", cinUpper],
        ["Date of Signing", dateStr],
      ];
      for (const [label, value] of infoLines) {
        checkPage(7);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...darkBlue);
        doc.text(`${label}:`, margin + 2, y);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...black);
        doc.text(value, margin + 48, y);
        y += 6;
      }

      y += 3;
      checkPage(36);

      // Signature image
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...darkBlue);
      doc.setFontSize(9);
      doc.text("Digital Signature:", margin + 2, y);
      y += 5;

      const canvas = canvasRef.current!;
      const sigDataURL = canvas.toDataURL("image/png");
      const sigW = 72;
      const sigH = 26;
      // Signature box border
      doc.setDrawColor(180, 195, 210);
      doc.setLineWidth(0.4);
      doc.rect(margin + 2, y, sigW + 4, sigH + 4);
      doc.addImage(sigDataURL, "PNG", margin + 4, y + 2, sigW, sigH);
      y += sigH + 10;

      // Confirmation line
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...grayText);
      writeLine(
        "☑  I confirm that I have read, understood, and agree to the EIDEN GROUP NDA and Internal Code of Conduct. I understand that my electronic signature is legally binding.",
        8.5, grayText, false, 2, 4.2
      );

      // Cert background (draw behind using rect after — just a bottom border line)
      y += 4;
      doc.setDrawColor(160, 175, 195);
      doc.setLineWidth(0.4);
      doc.line(margin, y, pageW - margin, y);

      // ── Page footers
      const totalPages = (doc.internal as any).getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...grayText);
        doc.text(
          `EIDEN GROUP — Confidential · Page ${i} of ${totalPages}`,
          pageW - margin,
          pageH - 8,
          { align: "right" }
        );
        doc.text("Bloc B - B101 · Technopole 1 Agadir Bay, Morocco", margin, pageH - 8);
      }

      const safeName = name.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "");
      const isoDate = today.toISOString().slice(0, 10);
      doc.save(`EIDEN_NDA_${safeName}_${cinUpper}_${isoDate}.pdf`);
      setStatus({ type: "success", text: "PDF signed and downloaded successfully. Upload it to your secure drive." });
    } catch (err) {
      console.error(err);
      setStatus({ type: "error", text: "An error occurred while generating the PDF. Please try again." });
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="w-full h-full overflow-y-auto pb-8">
      <div className="max-w-3xl mx-auto px-2 sm:px-4 pt-2 flex flex-col gap-5">

        {/* ── Title block */}
        <div className="eiden-card p-5 flex flex-col gap-1">
          <div className="flex items-center gap-3 flex-wrap">
            <FileText size={22} className="text-[var(--deep-forest)]" />
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "2px", color: "var(--deep-forest)" }}>
              EIDEN GROUP
            </span>
            <span style={{ background: "var(--deep-forest)", color: "white", fontSize: "0.72rem", fontWeight: 500, padding: "3px 10px", borderRadius: 40 }}>
              Confidential · NDA & Code of Conduct
            </span>
          </div>
          <p style={{ fontSize: "0.82rem", color: "var(--gris)", marginTop: 4 }}>
            📍 Bloc B - B101 - Technopole 1 Agadir Bay, Morocco &nbsp;·&nbsp; Electronic Signature — legally binding under Moroccan law
          </p>
        </div>

        {/* ── Agreement scroll box */}
        <div className="eiden-card p-0 overflow-hidden">
          <div style={{ background: "var(--deep-forest)", padding: "10px 18px" }}>
            <span style={{ color: "white", fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "2px", fontFamily: "'JetBrains Mono', monospace" }}>
              Agreement Text
            </span>
          </div>
          <div className="overflow-y-auto p-5" style={{ maxHeight: 400, fontSize: "0.85rem", lineHeight: 1.65, color: "var(--ink)" }}>
            {AGREEMENT_SECTIONS.map((section) => (
              <div key={section.title} className="mb-5">
                <h3 style={{ fontWeight: 700, fontSize: "0.92rem", color: "var(--deep-forest)", borderBottom: "1px solid var(--border)", paddingBottom: 4, marginBottom: 10, marginTop: 4 }}>
                  {section.title}
                </h3>
                {section.content.map((block) => (
                  <div key={block.heading} className="mb-3">
                    <h4 style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--ink)", marginBottom: 3 }}>{block.heading}</h4>
                    <p style={{ color: "var(--gris)", whiteSpace: "pre-line" }}>{block.text}</p>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* ── Form inputs */}
        <div className="eiden-card p-5 flex flex-col gap-4">
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.65rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "2px", color: "var(--deep-forest)" }}>
            Signatory Details
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label style={{ fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.4px", color: "var(--gris)" }}>
                Full Name (as per ID)
              </label>
              <input
                className="eiden-input"
                type="text"
                placeholder="e.g., Fatima El Fassi"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="name"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label style={{ fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.4px", color: "var(--gris)" }}>
                CIN (Moroccan National ID)
              </label>
              <input
                className="eiden-input"
                type="text"
                placeholder="e.g., AB123456"
                value={cin}
                onChange={(e) => {
                  setCin(e.target.value);
                  setCinError(e.target.value.trim().length > 0 && !isValidCIN(e.target.value));
                }}
                style={{ borderColor: cinError ? "var(--danger)" : undefined }}
                autoComplete="off"
              />
              {cinError && (
                <span style={{ fontSize: "0.75rem", color: "var(--danger)" }}>
                  Expected letter(s) followed by digits (e.g., AB123456)
                </span>
              )}
              {!cinError && (
                <span style={{ fontSize: "0.75rem", color: "var(--gris)" }}>Letter(s) + digits required</span>
              )}
            </div>
          </div>
        </div>

        {/* ── Signature pad */}
        <div className="eiden-card p-5 flex flex-col gap-3">
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.65rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "2px", color: "var(--deep-forest)" }}>
            ✍️ Digital Signature
          </span>
          <p style={{ fontSize: "0.8rem", color: "var(--gris)" }}>Draw your signature below using mouse or touch.</p>
          <div
            style={{
              display: "inline-block",
              border: "2px dashed var(--border)",
              borderRadius: 16,
              padding: 6,
              background: "white",
              width: "100%",
              maxWidth: 520,
            }}
          >
            <canvas
              ref={canvasRef}
              width={500}
              height={180}
              style={{
                display: "block",
                borderRadius: 12,
                background: "#fff",
                width: "100%",
                height: "auto",
                border: "1px solid #d9e0e9",
                cursor: "crosshair",
                touchAction: "none",
              }}
              onMouseDown={handlePointerDown}
              onMouseMove={handlePointerMove}
              onMouseUp={handlePointerUp}
              onMouseLeave={handlePointerUp}
              onTouchStart={handlePointerDown}
              onTouchMove={handlePointerMove}
              onTouchEnd={handlePointerUp}
              onTouchCancel={handlePointerUp}
            />
          </div>
          <div className="flex gap-3 flex-wrap items-center">
            <button
              onClick={clearSignature}
              className="flex items-center gap-2"
              style={{
                background: "transparent",
                border: "1.5px solid var(--border)",
                color: "var(--ink)",
                padding: "7px 16px",
                borderRadius: 40,
                fontWeight: 500,
                fontSize: "0.82rem",
                cursor: "pointer",
              }}
            >
              <RotateCcw size={13} />
              Clear signature
            </button>
          </div>
        </div>

        {/* ── Confirmation checkbox */}
        <div className="eiden-card p-4 flex items-start gap-3">
          <input
            type="checkbox"
            id="confirm_nda"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            style={{ width: 18, height: 18, marginTop: 2, accentColor: "var(--deep-forest)", flexShrink: 0 }}
          />
          <label htmlFor="confirm_nda" style={{ fontSize: "0.85rem", color: "var(--ink)", fontWeight: 500, cursor: "pointer" }}>
            I confirm that I have read and agree to the EIDEN GROUP NDA and Internal Code of Conduct. I understand that my electronic signature is legally binding.
          </label>
        </div>

        {/* ── Status message */}
        {status.type !== "idle" && (
          <div
            className="flex items-center gap-2 px-4 py-3 rounded-xl"
            style={{
              background: status.type === "success" ? "rgba(46,160,67,0.08)" : "rgba(201,61,61,0.08)",
              border: `1px solid ${status.type === "success" ? "rgba(46,160,67,0.25)" : "rgba(201,61,61,0.25)"}`,
              fontSize: "0.85rem",
              color: status.type === "success" ? "var(--success)" : "var(--danger)",
              fontWeight: 500,
            }}
          >
            {status.type === "success" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            {status.text}
          </div>
        )}

        {/* ── Action buttons */}
        <div className="flex flex-wrap gap-3 items-center pb-2">
          <button
            onClick={generatePDF}
            disabled={generating}
            className="btn-primary flex items-center gap-2"
            style={{ fontSize: "0.9rem", padding: "11px 28px", opacity: generating ? 0.6 : 1 }}
          >
            <Download size={16} />
            {generating ? "Generating PDF…" : "Sign & Download PDF"}
          </button>
          <span style={{ fontSize: "0.8rem", color: "var(--gris)" }}>
            PDF ready for secure drive storage
          </span>
        </div>

        <div style={{ fontSize: "0.75rem", color: "var(--gris)", borderTop: "1px solid var(--border)", paddingTop: 14, textAlign: "center" }}>
          EIDEN GROUP · Bloc B - B101 · Technopole 1 Agadir Bay · This digitally signed document is admissible under Moroccan law.
        </div>
      </div>
    </div>
  );
}
