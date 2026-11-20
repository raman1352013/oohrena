import PDFDocument from "pdfkit";

export type PdfBlock =
  | { kind: "heading"; text: string }
  | { kind: "kv"; rows: [string, string | number][] }
  | { kind: "table"; head: string[]; rows: (string | number)[][]; widths?: number[] }
  | { kind: "text"; text: string };

const inr = (n: number) => `Rs. ${Math.round(n).toLocaleString("en-IN")}`;
export const pdfMoney = inr;

/** Plain, printable A4 document: OOHRENA header, title, blocks, and a generated-at footer on every page. */
export function renderPdf(title: string, subtitle: string, blocks: PdfBlock[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48, bufferPages: true, info: { Title: title, Author: "OOHRENA" } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const width = doc.page.width - 96;

    doc.fillColor("#0B192C").fontSize(18).font("Helvetica-Bold").text("OOHRENA", { continued: true }).fillColor("#EA580C").fontSize(10).font("Helvetica").text("   Outdoor x Digital x Trackable");
    doc.moveDown(0.6).fillColor("#0B192C").fontSize(14).font("Helvetica-Bold").text(title);
    doc.fillColor("#64748B").fontSize(9).font("Helvetica").text(subtitle).moveDown(0.8);

    for (const b of blocks) {
      if (doc.y > doc.page.height - 120) doc.addPage();
      if (b.kind === "heading") doc.moveDown(0.4).fillColor("#0B192C").fontSize(11).font("Helvetica-Bold").text(b.text).moveDown(0.3);
      if (b.kind === "text") doc.fillColor("#334155").fontSize(9).font("Helvetica").text(b.text, { width }).moveDown(0.3);
      if (b.kind === "kv") {
        for (const [k, v] of b.rows) {
          const y = doc.y;
          doc.fillColor("#64748B").fontSize(9).font("Helvetica").text(k, 48, y, { width: width * 0.6 });
          doc.fillColor("#0B192C").font("Helvetica-Bold").text(String(v), 48 + width * 0.6, y, { width: width * 0.4, align: "right" });
          doc.moveDown(0.2);
        }
      }
      if (b.kind === "table") {
        const widths = b.widths ?? b.head.map(() => width / b.head.length);
        const row = (cells: (string | number)[], bold: boolean) => {
          if (doc.y > doc.page.height - 80) doc.addPage();
          const y = doc.y;
          let x = 48;
          let h = 0;
          cells.forEach((c, i) => {
            doc.fillColor(bold ? "#0B192C" : "#334155").fontSize(8).font(bold ? "Helvetica-Bold" : "Helvetica").text(String(c), x + 2, y, { width: widths[i]! - 4 });
            h = Math.max(h, doc.y - y);
            x += widths[i]!;
          });
          doc.y = y + h + 4;
          doc.moveTo(48, doc.y - 2).lineTo(48 + width, doc.y - 2).strokeColor("#E2E8F0").lineWidth(0.5).stroke();
        };
        row(b.head, true);
        for (const r of b.rows) row(r, false);
        doc.moveDown(0.3);
      }
    }

    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(i);
      doc.fillColor("#94A3B8").fontSize(7).font("Helvetica").text(`Generated ${new Date().toISOString()} · page ${i + 1} of ${range.count} · system-generated from OOHRENA records`, 48, doc.page.height - 36, { width, align: "center" });
    }
    doc.end();
  });
}
