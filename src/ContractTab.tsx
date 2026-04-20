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
    title: "PART I: NON-DISCLOSURE AGREEMENT (NDA)",
    content: [
      {
        heading: "Overview",
        text: 'EIDEN GROUP / EIDEN SARL, with registered address at Bloc B - B101 - Technopole 1 Agadir Bay, Morocco (the "Company"), and the undersigned individual ("Team Member") agree as follows:',
      },
      {
        
        heading: "1. Confidential Information",
        text: "Includes all non-public information relating to the Company's business, including but not limited to: internal systems, software frameworks, proprietary code, algorithms, web applications, client/customer data, financial records, strategic plans, trade secrets, methodologies, and any information disclosed in the Internal Code of Conduct.",
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
        text: "1. Lead by Example, Not by Force - Great leaders inspire through action. Micromanagement has no place; accountability and ownership do.\n2. Embrace Calculated Risk and Innovation - Bold thinking and creative solutions are our competitive edge.\n3. Hunger for Success and Continuous Learning - Ambition drives us. We invest in learning; complacency is the enemy.\n4. Order Over Chaos, Always - Discipline, structure, and systematic execution accelerate momentum.\n5. Shared Vision, Collective Achievement - We win together. Collaboration and alignment are non-negotiable.",
      },
      {
        heading: "Core Commitments",
        text: "- Respect for Our Vision: Every decision should honor EIDEN's vision.\n- Respect for Our People: Dignity, fairness, and respect for all. Discrimination or harassment will not be tolerated.\n- Confidentiality and Integrity: What happens within EIDEN stays within EIDEN. Breach of trust leads to immediate termination.",
      },
      {
        heading: "Work Schedule and Attendance",
        text: "- Office Hours: Mon-Thu arrive 10:00 AM (work begins 10:30) - 5:00 PM; Friday remote 3:00-6:00 PM.\n- Time Tracking: Clock in/out via Jibble; select appropriate activity. Failure leads to disciplinary meeting.\n- Attendance: >4 unjustified absences or >5 delays/month -> disciplinary action.",
      },
      {
        heading: "Work Focus and Personal Development",
        text: "- 90/10 Rule: 90% focus on EIDEN work, 10% on personal projects/professional development.\n- Phone Usage Policy: Limited to essential communication. Excessive use triggers one-on-one discussion.",
      },
      {
        heading: "Equipment and Resources",
        text: "Respect company property; office equipment for professional use only. Report damages immediately. Misuse may incur financial liability.",
      },
      {
        heading: "Performance and Accountability",
        text: "- KPIs: Clearly defined and aligned with EIDEN's objectives. Regular reviews; failure triggers action plan.\n- Weekly Reporting: Every Friday submit report covering completed work, blockers, and pending tasks.",
      },
      {
        heading: "Collaboration and Communication",
        text: "Open, honest dialogue; constructive conflict resolution; celebrate wins together.",
      },
      {
        heading: "Work Environment and Culture",
        text: "Flexibility with discipline; balance and well-being; fun and connection.",
      },
      {
        heading: "Disciplinary Process",
        text: "1. Verbal Warning  ->  2. Written Warning  ->  3. Final Warning  ->  4. Termination.",
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
    ctx.strokeStyle = "#122620";
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

  // ── PDF Generation ────────────────────────────────────────────────────────────
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
      const ML = 18;   // left margin
      const MR = 18;   // right margin
      const usableW = pageW - ML - MR;
      const FOOTER_H = 11;
      const CONTENT_BOTTOM = pageH - FOOTER_H - 4;
      let y = 0;

      // Brand palette (#122620)
      const brand:     [number, number, number] = [18, 38, 32];
      const brandDim:  [number, number, number] = [28, 58, 48];
      const brandLight:[number, number, number] = [236, 243, 240];
      const gold:      [number, number, number] = [188, 152, 84];
      const white:     [number, number, number] = [255, 255, 255];
      const ink:       [number, number, number] = [22, 30, 28];
      const muted:     [number, number, number] = [95, 112, 106];
      const borderC:   [number, number, number] = [200, 215, 210];
      const certBg:    [number, number, number] = [245, 249, 247];

      // ── helpers ──────────────────────────────────────────────────
      function needSpace(h: number) {
        if (y + h > CONTENT_BOTTOM) {
          renderFooter();
          doc.addPage();
          y = 10;
        }
      }

      function writeText(
        text: string,
        size: number,
        color: [number, number, number],
        style: "normal" | "bold" | "italic",
        indentX = 0,
        leading?: number
      ) {
        doc.setFontSize(size);
        doc.setFont("helvetica", style);
        doc.setTextColor(...color);
        const lh = leading ?? size * 0.43;
        const lines = doc.splitTextToSize(text, usableW - indentX) as string[];
        for (const line of lines) {
          needSpace(lh + 1);
          doc.text(line, ML + indentX, y);
          y += lh;
        }
      }

      function hLine(color: [number,number,number] = borderC, lw = 0.3) {
        doc.setDrawColor(...color);
        doc.setLineWidth(lw);
        doc.line(ML, y, pageW - MR, y);
      }

      function renderFooter() {
        const pg = (doc.internal as any).getCurrentPageInfo().pageNumber as number;
        const total = (doc.internal as any).getNumberOfPages() as number;
        doc.setFillColor(...brand);
        doc.rect(0, pageH - FOOTER_H, pageW, FOOTER_H, "F");
        // gold accent on top of footer
        doc.setFillColor(...gold);
        doc.rect(0, pageH - FOOTER_H, pageW, 0.7, "F");
        doc.setFontSize(6.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...white);
        doc.text("EIDEN GROUP  |  Confidential", ML, pageH - 4);
        doc.text("Bloc B - B101  |  Technopole 1 Agadir Bay, Morocco", pageW / 2, pageH - 4, { align: "center" });
        doc.text(`Page ${pg} / ${total}`, pageW - MR, pageH - 4, { align: "right" });
      }

      // ── PAGE 1: HEADER COVER BAND ─────────────────────────────────
      // Dark green full-width header
      doc.setFillColor(...brand);
      doc.rect(0, 0, pageW, 46, "F");

      // Gold horizontal stripe below header
      doc.setFillColor(...gold);
      doc.rect(0, 46, pageW, 1.4, "F");

      // Left: company name
      doc.setFontSize(24);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...white);
      doc.text("EIDEN GROUP", ML, 18);

      // Left: address
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...white);
      doc.text("Bloc B - B101  |  Technopole 1 Agadir Bay, Morocco", ML, 25);

      // Left: legal note
      doc.setFontSize(7);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(...white);
      doc.text("Electronically signed  |  Legally binding under Moroccan law", ML, 31);

      // Right: document title block
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...white);
      doc.text("NON-DISCLOSURE AGREEMENT", pageW - MR, 17, { align: "right" });
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...white);
      doc.text("& Internal Code of Conduct", pageW - MR, 24, { align: "right" });

      // Right: document ref
      const today = new Date();
      const isoDate = today.toISOString().slice(0, 10);
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...white);
      doc.text(`Ref: EIDEN-NDA-${cinUpper}-${isoDate}`, pageW - MR, 31, { align: "right" });

      y = 55;

      // ── AGREEMENT SECTIONS ────────────────────────────────────────
      for (const section of AGREEMENT_SECTIONS) {
        needSpace(16);

        // Section header — full-width dark band
        const secBarH = 10;
        doc.setFillColor(...brand);
        doc.rect(ML, y - 1, usableW, secBarH, "F");
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...white);
        doc.text(section.title, ML + 4, y + 5.5);
        y += secBarH + 4;

        for (const block of section.content) {
          needSpace(14);

          // Sub-heading with left accent bar
          doc.setFillColor(...gold);
          doc.rect(ML, y, 2.2, 5, "F");
          doc.setFontSize(8.5);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(...brandDim);
          doc.text(block.heading, ML + 5, y + 4);
          y += 7;

          // Body — split on newlines for numbered/bulleted lists
          const paragraphs = block.text.split("\n");
          for (const p of paragraphs) {
            const t = p.trim();
            if (!t) continue;
            const isList = /^[-\d]/.test(t);
            writeText(t, 8.2, ink, "normal", isList ? 5 : 3, 4.0);
            y += 0.5;
          }
          y += 3.5;
        }
        y += 2;
      }

      // ── SIGNATURE CERTIFICATE PAGE ────────────────────────────────
      // Force certificate onto a fresh section with enough space
      needSpace(75);

      // Gold divider before cert
      doc.setFillColor(...gold);
      doc.rect(ML, y, usableW, 1, "F");
      y += 7;

      const certY = y - 4;

      // Certificate title row
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...brand);
      doc.text("SIGNATURE CERTIFICATE", ML + 4, y + 4);

      y += 14;

      // Info rows
      const infoRows: [string, string][] = [
        ["Full Name", name],
        ["CIN (Moroccan National ID)", cinUpper],
        ["Date of Signing", today.toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" })],
      ];

      for (let i = 0; i < infoRows.length; i++) {
        const [label, value] = infoRows[i];
        const rowH = 8;
        // Alternating row bg
        doc.setFillColor(i % 2 === 0 ? 228 : 240, i % 2 === 0 ? 238 : 245, i % 2 === 0 ? 233 : 242);
        doc.rect(ML, y - 3, usableW, rowH, "F");
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...muted);
        doc.text(label, ML + 4, y + 1.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...ink);
        doc.text(value, ML + 65, y + 1.5);
        y += rowH;
      }

      y += 5;

      // Signature box
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...brand);
      doc.text("Digital Signature", ML + 4, y);
      y += 5;

      const canvas = canvasRef.current!;
      const sigDataURL = canvas.toDataURL("image/png");
      const sigW = 85;
      const sigH = 30;

      // White rounded box with border
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(...borderC);
      doc.setLineWidth(0.5);
      doc.roundedRect(ML + 2, y, sigW + 6, sigH + 4, 2.5, 2.5, "FD");
      doc.addImage(sigDataURL, "PNG", ML + 5, y + 2, sigW, sigH);
      y += sigH + 10;

      // Confirmation text
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(...muted);
      writeText(
        "By signing, I confirm I have read, understood, and agreed to the EIDEN GROUP NDA and Internal Code of Conduct. I understand this electronic signature is legally binding under Moroccan law.",
        7.5, muted, "italic", 3, 3.6
      );
      y += 4;

      // Cert border box
      doc.setDrawColor(...borderC);
      doc.setLineWidth(0.4);
      doc.roundedRect(ML, certY, usableW, y - certY, 2.5, 2.5, "S");

      // Gold bottom accent
      y += 4;
      doc.setFillColor(...gold);
      doc.rect(ML, y, usableW, 0.8, "F");

      // ── RE-RENDER ALL FOOTERS ────────────────────────────────────
      const totalPages = (doc.internal as any).getNumberOfPages() as number;
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFillColor(...brand);
        doc.rect(0, pageH - FOOTER_H, pageW, FOOTER_H, "F");
        doc.setFillColor(...gold);
        doc.rect(0, pageH - FOOTER_H, pageW, 0.7, "F");
        doc.setFontSize(6.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...white);
        doc.text("EIDEN GROUP  |  Confidential", ML, pageH - 4);
        doc.text("Bloc B - B101  |  Technopole 1 Agadir Bay, Morocco", pageW / 2, pageH - 4, { align: "center" });
        doc.text(`Page ${i} / ${totalPages}`, pageW - MR, pageH - 4, { align: "right" });
      }

      const safeName = name.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "");
      doc.save(`EIDEN_NDA_${safeName}_${cinUpper}_${isoDate}.pdf`);
      setStatus({ type: "success", text: "PDF signed and downloaded. Upload it to your secure drive." });
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
            <span style={{ background: "#122620", color: "white", fontSize: "0.72rem", fontWeight: 500, padding: "3px 10px", borderRadius: 40 }}>
              Confidential · NDA & Code of Conduct
            </span>
          </div>
          <p style={{ fontSize: "0.82rem", color: "var(--gris)", marginTop: 4 }}>
            Bloc B - B101 - Technopole 1 Agadir Bay, Morocco &nbsp;·&nbsp; Electronic Signature — legally binding under Moroccan law
          </p>
        </div>

        {/* ── Agreement scroll box */}
        <div className="eiden-card p-0 overflow-hidden">
          <div style={{ background: "#122620", padding: "10px 18px" }}>
            <span style={{ color: "white", fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "2px", fontFamily: "'JetBrains Mono', monospace" }}>
              Agreement Text
            </span>
          </div>
          <div className="overflow-y-auto p-5" style={{ maxHeight: 400, fontSize: "0.85rem", lineHeight: 1.65, color: "var(--ink)" }}>
            {AGREEMENT_SECTIONS.map((section) => (
              <div key={section.title} className="mb-5">
                <h3 style={{ fontWeight: 700, fontSize: "0.92rem", color: "#122620", borderBottom: "1px solid var(--border)", paddingBottom: 4, marginBottom: 10, marginTop: 4 }}>
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
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.65rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "2px", color: "#122620" }}>
            Signatory Details
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label style={{ fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.4px", color: "var(--gris)" }}>
                Full Name (as per ID)
              </label>
              <input
                style={{ border: "1px solid var(--border)", color: "var(--ink)" }}
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
              {cinError ? (
                <span style={{ fontSize: "0.75rem", color: "var(--danger)" }}>Expected letter(s) + digits (e.g., AB123456)</span>
              ) : (
                <span style={{ fontSize: "0.75rem", color: "var(--gris)" }}>Letter(s) + digits required</span>
              )}
            </div>
          </div>
        </div>

        {/* ── Signature pad */}
        <div className="eiden-card p-5 flex flex-col gap-3">
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.65rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "2px", color: "#122620" }}>
            Digital Signature
          </span>
          <p style={{ fontSize: "0.8rem", color: "var(--gris)" }}>Draw your signature below using mouse or touch.</p>
          <div style={{ display: "inline-block", border: "2px dashed var(--border)", borderRadius: 16, padding: 6, background: "white", width: "100%", maxWidth: 520 }}>
            <canvas
              ref={canvasRef}
              width={500}
              height={180}
              style={{ display: "block", borderRadius: 12, background: "#fff", width: "100%", height: "auto", border: "1px solid #d9e0e9", cursor: "crosshair", touchAction: "none" }}
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
              style={{ background: "transparent", border: "1.5px solid var(--border)", color: "var(--ink)", padding: "7px 16px", borderRadius: 40, fontWeight: 500, fontSize: "0.82rem", cursor: "pointer" }}
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
            style={{ width: 18, height: 18, marginTop: 2, accentColor: "#122620", flexShrink: 0 }}
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
            style={{ fontSize: "0.9rem", padding: "11px 28px", opacity: generating ? 0.6 : 1, background: "#122620", borderColor: "#122620" }}
          >
            <Download size={16} />
            {generating ? "Generating PDF..." : "Sign & Download PDF"}
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
