const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, ShadingType, LevelFormat,
  PageNumber, NumberFormat, VerticalAlign
} = require('docx');
const fs = require('fs');

// ── PIET GUIDELINES ──────────────────────────────────────────────
// A4: 11906 x 16838 DXA
// Left: 35mm = 1984 DXA | Top/Right/Bottom: 25mm = 1418 DXA
// Body: Times New Roman 11pt = size 22
// Chapter title: 14pt bold uppercase centered = size 28
// Sub-heading: 11pt bold capitalize each word align left = size 22 bold
// Line spacing: 1.5 = 360
// Front matter: lowercase roman numerals bottom center
// Chapters: Arabic numerals bottom center
// Cover: NO page number
// ─────────────────────────────────────────────────────────────────

const FONT   = "Times New Roman";
const SZ     = 22;   // 11pt body
const SZ12   = 24;   // 12pt cover names
const SZ14   = 28;   // 14pt chapter / cover labels
const SZ15   = 30;   // 15pt degree name
const SZ18   = 36;   // 18pt project title
const LS     = 360;  // 1.5 line spacing
const PAGE   = { width: 11906, height: 16838 };
const MARGIN = { top: 1418, right: 1418, bottom: 1418, left: 1984 };
const CW     = 11906 - 1984 - 1418; // 8504 DXA content width

// ── Borders ──────────────────────────────────────────────────────
const nb  = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const nob = { top: nb, bottom: nb, left: nb, right: nb };
const cb  = { style: BorderStyle.SINGLE, size: 4, color: "999999" };
const tbb = { top: cb, bottom: cb, left: cb, right: cb };

// ── Paragraph factory ─────────────────────────────────────────────
function p(text, opts = {}) {
  return new Paragraph({
    alignment:       opts.align   ?? AlignmentType.JUSTIFIED,
    spacing:         { before: opts.before ?? 0, after: opts.after ?? 0, line: opts.line ?? LS },
    indent:          opts.indent,
    numbering:       opts.num,
    pageBreakBefore: opts.pb || false,
    children: [new TextRun({
      text,
      font:     FONT,
      size:     opts.sz    ?? SZ,
      bold:     opts.bold  ?? false,
      italics:  opts.ital  ?? false,
      underline: opts.ul   ? {} : undefined,
    })]
  });
}

const blk  = () => new Paragraph({ spacing: { before: 0, after: 0, line: 240 }, children: [new TextRun({ text: "", font: FONT, size: SZ })] });
const dblk = () => new Paragraph({ spacing: { before: 0, after: 0, line: 480 }, children: [new TextRun({ text: "", font: FONT, size: SZ })] });

// centered helpers
const ctr  = (t, sz, bold, ital) => p(t, { align: AlignmentType.CENTER, sz: sz ?? SZ, bold: bold ?? false, ital: ital ?? false, before: 0, after: 0 });
const ctrB = (t, sz) => ctr(t, sz, true);

// Chapter title: 14pt bold uppercase centered, pageBreak, double-space below
function chTitle(text, pb = true) {
  return [new Paragraph({
    pageBreakBefore: pb,
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 480, line: LS },
    children: [new TextRun({ text: text.toUpperCase(), font: FONT, size: SZ14, bold: true })]
  })];
}

// Sub-heading: 11pt bold capitalize, left, single blank above and below
const sh = (t) => new Paragraph({
  alignment: AlignmentType.LEFT,
  spacing: { before: 240, after: 240, line: LS },
  children: [new TextRun({ text: t, font: FONT, size: SZ, bold: true })]
});

// Body paragraph
const bp = (t) => p(t, { before: 0, after: 0, line: LS });

// Bullet
function bul(t) {
  return new Paragraph({
    numbering: { reference: "bul", level: 0 },
    alignment: AlignmentType.JUSTIFIED,
    spacing: { before: 0, after: 0, line: LS },
    indent: { left: 720, hanging: 360 },
    children: [new TextRun({ text: t, font: FONT, size: SZ })]
  });
}

// two-col cover table
function coverTable(left, right) {
  const half = Math.floor(CW / 2);
  function cell(rows) {
    return new TableCell({
      borders: nob,
      width: { size: half, type: WidthType.DXA },
      children: rows.map(([t, sz, bold, ital]) => new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { before: 40, after: 40, line: LS },
        children: [new TextRun({ text: t, font: FONT, size: sz ?? SZ12, bold: bold ?? false, italics: ital ?? false })]
      }))
    });
  }
  return new Table({
    width: { size: CW, type: WidthType.DXA },
    columnWidths: [half, half],
    rows: [new TableRow({ children: [cell(left), cell(right)] })]
  });
}

// table helpers
function tRow(cells, widths, hdr) {
  return new TableRow({ children: cells.map((t, i) => new TableCell({
    borders: tbb,
    shading: hdr ? { fill: "DCE6F1", type: ShadingType.CLEAR } : undefined,
    width: { size: widths[i], type: WidthType.DXA },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({ alignment: AlignmentType.LEFT, children: [new TextRun({ text: t, font: FONT, size: SZ, bold: hdr ?? false })] })]
  })) });
}

// TOC entry
function tocEntry(num, title, pg, bold, indent) {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { before: 0, after: 0, line: LS },
    indent: { left: indent ? 360 : 0 },
    tabStops: [{ type: "right", position: CW - 200 }],
    children: [
      new TextRun({ text: (num ? num + "  " : "    ") + title + "\t" + pg, font: FONT, size: SZ, bold: bold ?? false })
    ]
  });
}

// page-number footer paragraph
const pgFooter = () => ({
  footers: { default: { options: { children: [
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: SZ })] })
  ] } } }
});

// ── DOCUMENT ─────────────────────────────────────────────────────
const doc = new Document({
  numbering: {
    config: [
      { reference: "bul",  levels: [{ level: 0, format: LevelFormat.BULLET,  text: "\u2022", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "num",  levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.",   alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ]
  },
  styles: { default: { document: { run: { font: FONT, size: SZ } } } },
  sections: [

  // ═══════════════════════════════════════════════════════════════
  // SECTION 1 — COVER (no page number)
  // ═══════════════════════════════════════════════════════════════
  {
    properties: { page: { size: PAGE, margin: MARGIN } },
    children: [
      new Paragraph({ spacing: { before: 2835, after: 0 }, children: [new TextRun("")] }),
      ctrB("DOCSIMILARITY: AI-POWERED DOCUMENT SEMANTIC", SZ18),
      ctrB("ANALYSIS AND SIMILARITY DETECTION", SZ18),
      blk(),
      ctr("A Project Report (Project-II) submitted in partial fulfillment of the", SZ14),
      ctr("requirements for the award of degree of", SZ14),
      blk(),
      ctrB("BACHELOR OF TECHNOLOGY", SZ15),
      ctrB("IN", SZ15),
      ctrB("INFORMATION TECHNOLOGY", SZ15),
      blk(),
      ctr("DECEMBER 2025", SZ14),
      blk(), blk(),
      coverTable(
        [["Supervised by", SZ14, true, true], ["Mr. Sourabh Gupta", SZ12, true], ["Assistant Professor", SZ12, true]],
        [["Submitted by", SZ14, true, true], ["Saloni Devi (2823681)", SZ12, true], ["Vansh Salgotra (2823679)", SZ12, true], ["Ajay Singh (2823682)", SZ12, true], ["Himanshi Verma (2823680)", SZ12, true], ["VII Semester", SZ12, true]]
      ),
      blk(), blk(),
      ctrB("DEPARTMENT OF INFORMATION TECHNOLOGY", SZ14),
      blk(),
      ctrB("PANIPAT INSTITUTE OF ENGINEERING AND TECHNOLOGY", SZ14),
      ctrB("SAMALKHA, PANIPAT-132103", SZ14),
      blk(),
      ctrB("(Approved by AICTE and Affiliated to the Kurukshetra University, Kurukshetra)", SZ),
    ]
  },

  // ═══════════════════════════════════════════════════════════════
  // SECTION 2 — FRONT MATTER (roman numerals)
  // ═══════════════════════════════════════════════════════════════
  {
    properties: { page: { size: PAGE, margin: MARGIN, pageNumbers: { start: 1, formatType: NumberFormat.LOWER_ROMAN } } },
    ...pgFooter(),
    children: [

    // ── DECLARATION ──────────────────────────────────────────────
    ...chTitle("DECLARATION", false),
    bp("We, the undersigned students of the Bachelor of Technology programme in Information Technology, Seventh Semester, at Panipat Institute of Engineering and Technology, hereby declare that:"),
    blk(),
    bp("i.    The project work documented in this report is a genuine outcome of our independent academic endeavour, carried out entirely under the mentorship and supervision of our designated project guide. This work has not been submitted, either in whole or in part, to any other university, institution, or examining body for the award of any degree, diploma, or any other academic distinction."),
    blk(),
    bp("ii.   Wherever we have drawn upon ideas, textual material, datasets, illustrations, charts, inferences, or any other form of information from published or unpublished external sources, we have duly acknowledged those sources by incorporating appropriate citations within the text of this report. A comprehensive list of all such references has been provided at the end of this report."),
    blk(),
    bp("iii.  In the preparation of this report, we have conscientiously followed all guidelines and instructions issued by the Department of Information Technology, Panipat Institute of Engineering and Technology, to the best of our understanding and ability."),
    blk(),
    bp("iv.   We further declare that the similarity index of this report, as assessed through the authorized plagiarism checking tool, is within the permissible limit prescribed by the institute."),
    blk(), blk(),
    bp("Name(s) of the Student(s), Roll Number(s):"),
    bp("Saloni Devi (2823681)"),
    bp("Vansh Salgotra (2823679)"),
    bp("Ajay Singh (2823682)"),
    bp("Himanshi Verma (2823680)"),
    blk(),
    bp("Project Report Title: DocSimilarity: AI-Powered Document Semantic Analysis and Similarity Detection"),
    bp("Programme: B.Tech. in Information Technology, VII Semester"),
    bp("Date: ____________"),

    // ── APPROVAL ─────────────────────────────────────────────────
    ...chTitle("APPROVAL FROM SUPERVISOR"),
    bp("This is to affirm that the project report bearing the title \"DocSimilarity: AI-Powered Document Semantic Analysis and Similarity Detection\", prepared and submitted by Saloni Devi (2823681), Vansh Salgotra (2823679), Ajay Singh (2823682), and Himanshi Verma (2823680), students of the VII Semester, B.Tech. in Information Technology, represents authentic and original work conducted under my direct supervision and guidance."),
    blk(),
    bp("To the best of my knowledge and belief, the intellectual contributions presented in this report are original and have not been previously submitted anywhere for the award of any academic degree or diploma. The work reflects the students' diligent application of concepts studied during their programme, combined with independent research and systematic software development effort."),
    blk(),
    bp("I hereby recommend this project report for acceptance as partial fulfillment of the requirements stipulated for the award of the degree of Bachelor of Technology in Information Technology."),
    blk(), blk(), blk(),
    bp("________________________"),
    bp("Name: Mr. Sourabh Gupta"),
    bp("Designation: Assistant Professor"),
    bp("Department of Information Technology"),
    bp("Panipat Institute of Engineering and Technology"),
    bp("Date: _______________"),
    blk(), blk(),
    bp("(Counter Signed by)"),
    bp("Head, Department of Information Technology"),

    // ── CERTIFICATE ──────────────────────────────────────────────
    ...chTitle("CERTIFICATE"),
    bp("This is to certify that the project report titled \"DocSimilarity: AI-Powered Document Semantic Analysis and Similarity Detection\", presented by Saloni Devi (2823681), Vansh Salgotra (2823679), Ajay Singh (2823682), and Himanshi Verma (2823680), students of B.Tech. VII Semester in the Department of Information Technology at Panipat Institute of Engineering and Technology, Samalkha, constitutes a bonafide record of original work carried out by them during the academic session 2025–26."),
    blk(),
    bp("The report has been prepared under proper academic supervision and is recommended for evaluation in partial fulfillment of the requirements for the award of the degree of Bachelor of Technology in Information Technology, as affiliated to Kurukshetra University, Kurukshetra."),
    blk(), blk(), blk(),
    bp("________________________"),
    bp("Internal Examiner"),
    blk(), blk(),
    bp("________________________"),
    bp("External Examiner"),
    blk(),
    bp("Date:"),
    bp("Place: Panipat"),

    // ── ACKNOWLEDGEMENTS ─────────────────────────────────────────
    ...chTitle("ACKNOWLEDGEMENTS"),
    bp("The journey of developing DocSimilarity has been an intellectually enriching and deeply rewarding experience, made possible by the contribution, encouragement, and patience of several remarkable individuals whom we wish to acknowledge with heartfelt gratitude."),
    blk(),
    bp("First and foremost, we are profoundly grateful to our project supervisor, Mr. Sourabh Gupta, Assistant Professor, Department of Information Technology, Panipat Institute of Engineering and Technology. His mentorship extended far beyond technical guidance; he helped us understand the nuances of research methodology, challenged us to think critically about our design decisions, and provided consistent encouragement during the moments when technical obstacles felt insurmountable. This project would simply not exist in its current form without his patient and expert direction."),
    blk(),
    bp("We extend our sincere appreciation to the Head of the Department of Information Technology and the academic administration of Panipat Institute of Engineering and Technology for fostering a research-conducive environment and for ensuring access to the software tools, computing laboratories, and institutional resources that were essential to this work."),
    blk(),
    bp("Our gratitude also extends to the faculty members of the Department of Information Technology who, through their teaching across the preceding semesters, built the theoretical foundation upon which this project rests. Particular acknowledgement is owed to the faculty who introduced us to the domains of Natural Language Processing, Data Structures, and Web Technologies."),
    blk(),
    bp("We are equally thankful to our batchmates and peers who participated in the user testing phase of this project, dedicating their time to evaluate the system and offering candid feedback that led to meaningful improvements in both functionality and interface design."),
    blk(),
    bp("Finally, and most deeply, we thank our families for their unconditional support, patience, and encouragement throughout the demanding phases of this academic year. Their belief in our capabilities has been the most sustaining source of motivation."),
    blk(),
    bp("Saloni Devi, Vansh Salgotra, Ajay Singh, Himanshi Verma"),
    bp("Roll Numbers: 2823681, 2823679, 2823682, 2823680"),
    bp("Date: ____________"),

    // ── ABSTRACT ─────────────────────────────────────────────────
    ...chTitle("ABSTRACT"),
    bp("The proliferation of digital textual content across academic institutions, legal practices, and corporate organizations has created an urgent demand for reliable automated document comparison tools. Existing plagiarism detection systems, which predominantly operate on lexical or syntactic matching principles, have become increasingly inadequate in the face of sophisticated paraphrasing techniques now made accessible through widely available artificial intelligence writing assistants. These tools enable the restatement of entire documents while preserving their original conceptual meaning, effectively rendering keyword-based detectors obsolete for this class of academic dishonesty."),
    blk(),
    bp("This report presents DocSimilarity, a locally deployable, full-stack web application engineered to address this gap through genuine semantic understanding. The system employs the all-MiniLM-L6-v2 Sentence-Transformer model to encode input text as 384-dimensional vector representations that capture contextual and conceptual meaning rather than surface-level vocabulary. Similarity between documents is then quantified using Cosine Similarity mathematics, yielding an interpretable percentage score. The application is constructed on a three-tier decoupled architecture comprising a React.js frontend for visual result presentation, a FastAPI backend for asynchronous multi-modal processing, and a MongoDB database for persistent analysis history."),
    blk(),
    bp("The system accepts PDF, DOCX, plain text, and raster image inputs through a unified extraction pipeline incorporating PyTesseract Optical Character Recognition. Crucially, all inference is executed locally on the host machine, ensuring that sensitive documents are never transmitted to external servers. Experimental evaluation confirmed the system achieves a semantic detection score of 91% for synonym-substituted documents compared to 22% from keyword-based methods, and 84% versus 12% for structurally paraphrased content, demonstrating a decisive accuracy advantage that validates the semantic embedding approach."),
    blk(),
    bp("Keywords: Semantic Similarity Detection, Sentence Transformers, Natural Language Processing, Plagiarism Detection, Cosine Similarity, FastAPI, React.js, Optical Character Recognition, Privacy-First Artificial Intelligence."),

    // ── TABLE OF CONTENTS ─────────────────────────────────────────
    ...chTitle("TABLE OF CONTENTS"),
    tocEntry("", "Declaration", "i", false, false),
    tocEntry("", "Approval from Supervisor", "ii", false, false),
    tocEntry("", "Certificate", "iii", false, false),
    tocEntry("", "Acknowledgements", "iv", false, false),
    tocEntry("", "Abstract", "v", false, false),
    tocEntry("", "List of Tables", "vi", false, false),
    tocEntry("", "List of Figures", "vii", false, false),
    tocEntry("", "List of Abbreviations and Symbols", "viii", false, false),
    blk(),
    tocEntry("Chapter 1", "Introduction", "1", true, false),
    tocEntry("", "1.1  Overview of the Project", "1", false, true),
    tocEntry("", "1.2  Motivation and Background", "3", false, true),
    tocEntry("", "1.3  Problem Statement", "5", false, true),
    tocEntry("", "1.4  Scope and Boundaries", "7", false, true),
    tocEntry("", "1.5  Project Organization", "8", false, true),
    blk(),
    tocEntry("Chapter 2", "Literature Review", "9", true, false),
    tocEntry("", "2.1  Historical Development of Text Similarity Methods", "9", false, true),
    tocEntry("", "2.2  From Static Word Vectors to Contextual Embeddings", "11", false, true),
    tocEntry("", "2.3  Sentence-Level Semantic Representations", "13", false, true),
    tocEntry("", "2.4  Privacy and Deployment Challenges in Existing Tools", "15", false, true),
    tocEntry("", "2.5  Identification of Research Gaps", "16", false, true),
    tocEntry("", "2.6  Synthesis and Proposed Direction", "17", false, true),
    blk(),
    tocEntry("Chapter 3", "Problem Statement and Objectives", "19", true, false),
    tocEntry("", "3.1  Formal Problem Definition", "19", false, true),
    tocEntry("", "3.2  Research Objectives", "21", false, true),
    tocEntry("", "3.3  Functional Requirements", "22", false, true),
    tocEntry("", "3.4  Non-Functional Requirements", "23", false, true),
    blk(),
    tocEntry("Chapter 4", "Methodology", "25", true, false),
    tocEntry("", "4.1  System Architecture and Technology Selection", "25", false, true),
    tocEntry("", "4.2  Document Processing Pipeline", "27", false, true),
    tocEntry("", "4.3  Mathematical Foundation: Cosine Similarity", "30", false, true),
    tocEntry("", "4.4  Data Model and Persistence Design", "31", false, true),
    tocEntry("", "4.5  Security and Privacy Design", "32", false, true),
    blk(),
    tocEntry("Chapter 5", "Results and Discussion", "33", true, false),
    tocEntry("", "5.1  Development and Testing Environment", "33", false, true),
    tocEntry("", "5.2  System Performance Benchmarking", "34", false, true),
    tocEntry("", "5.3  Accuracy Evaluation and Comparative Analysis", "36", false, true),
    tocEntry("", "5.4  User Interface Screens and Interaction Flow", "38", false, true),
    tocEntry("", "5.5  User Acceptance Testing Feedback", "40", false, true),
    blk(),
    tocEntry("Chapter 6", "Conclusion and Future Scope", "41", true, false),
    tocEntry("", "6.1  Summary of Outcomes", "41", false, true),
    tocEntry("", "6.2  Key Innovations", "42", false, true),
    tocEntry("", "6.3  Social and Academic Impact", "43", false, true),
    tocEntry("", "6.4  Limitations of the Present System", "44", false, true),
    tocEntry("", "6.5  Future Enhancement Roadmap", "45", false, true),
    blk(),
    tocEntry("Appendix 1", "System Algorithm", "47", false, false),
    tocEntry("Appendix 2", "Project Mapping and Categorization", "49", false, false),
    tocEntry("Appendix 3", "Similarity Check Certificate", "51", false, false),
    tocEntry("", "References", "52", false, false),

    // ── LIST OF TABLES ────────────────────────────────────────────
    ...chTitle("LIST OF TABLES"),
    blk(),
    new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: [1400, 5700, 1404],
      rows: [
        tRow(["Table No.", "Table Title", "Page No."], [1400, 5700, 1404], true),
        tRow(["4.1", "Technology Stack and Version Details", "25"], [1400, 5700, 1404]),
        tRow(["5.1", "Hardware and Software Environment", "33"], [1400, 5700, 1404]),
        tRow(["5.2", "End-to-End Latency Benchmarks by File Type", "34"], [1400, 5700, 1404]),
        tRow(["5.3", "Semantic vs. Keyword Detection Accuracy Comparison", "36"], [1400, 5700, 1404]),
        tRow(["5.4", "User Acceptance Testing Scores", "40"], [1400, 5700, 1404]),
        tRow(["A2.1", "Project Mapping with Programme Outcomes and PSOs", "49"], [1400, 5700, 1404]),
      ]
    }),

    // ── LIST OF FIGURES ───────────────────────────────────────────
    ...chTitle("LIST OF FIGURES"),
    blk(),
    new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: [1400, 5700, 1404],
      rows: [
        tRow(["Figure No.", "Figure Title", "Page No."], [1400, 5700, 1404], true),
        tRow(["4.1", "Three-Tier System Architecture Diagram", "26"], [1400, 5700, 1404]),
        tRow(["4.2", "Document Processing Pipeline Flowchart", "28"], [1400, 5700, 1404]),
        tRow(["4.3", "Data Flow Diagram — Level 1", "31"], [1400, 5700, 1404]),
        tRow(["5.1", "Upload Interface — Dual File Drop Zones", "38"], [1400, 5700, 1404]),
        tRow(["5.2", "Real-Time Processing Audit Log Screen", "38"], [1400, 5700, 1404]),
        tRow(["5.3", "Similarity Gauge Result Visualization", "39"], [1400, 5700, 1404]),
        tRow(["5.4", "History Dashboard — Paginated Analysis Records", "39"], [1400, 5700, 1404]),
      ]
    }),

    // ── LIST OF ABBREVIATIONS ─────────────────────────────────────
    ...chTitle("LIST OF ABBREVIATIONS AND SYMBOLS"),
    blk(),
    new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: [2000, 6504],
      rows: [
        tRow(["Abbreviation", "Expansion"], [2000, 6504], true),
        tRow(["AI",       "Artificial Intelligence"], [2000, 6504]),
        tRow(["API",      "Application Programming Interface"], [2000, 6504]),
        tRow(["BERT",     "Bidirectional Encoder Representations from Transformers"], [2000, 6504]),
        tRow(["BoW",      "Bag of Words"], [2000, 6504]),
        tRow(["BSON",     "Binary Serialized Object Notation"], [2000, 6504]),
        tRow(["CPU",      "Central Processing Unit"], [2000, 6504]),
        tRow(["DFD",      "Data Flow Diagram"], [2000, 6504]),
        tRow(["DOCX",     "Document format for Microsoft Word (Open XML)"], [2000, 6504]),
        tRow(["ER",       "Entity-Relationship"], [2000, 6504]),
        tRow(["GloVe",    "Global Vectors for Word Representation"], [2000, 6504]),
        tRow(["JSON",     "JavaScript Object Notation"], [2000, 6504]),
        tRow(["MIME",     "Multipurpose Internet Mail Extensions"], [2000, 6504]),
        tRow(["MiniLM",   "Minimal Language Model (knowledge-distilled BERT variant)"], [2000, 6504]),
        tRow(["NLP",      "Natural Language Processing"], [2000, 6504]),
        tRow(["OCR",      "Optical Character Recognition"], [2000, 6504]),
        tRow(["PDF",      "Portable Document Format"], [2000, 6504]),
        tRow(["RAM",      "Random Access Memory"], [2000, 6504]),
        tRow(["REST",     "Representational State Transfer"], [2000, 6504]),
        tRow(["SBERT",    "Sentence Bidirectional Encoder Representations from Transformers"], [2000, 6504]),
        tRow(["SDG",      "Sustainable Development Goal"], [2000, 6504]),
        tRow(["TF-IDF",   "Term Frequency — Inverse Document Frequency"], [2000, 6504]),
        tRow(["UI",       "User Interface"], [2000, 6504]),
        tRow(["UTF-8",    "Universal Transformation Format — 8-bit"], [2000, 6504]),
        tRow(["Word2Vec", "Word to Vector (neural word embedding model by Mikolov et al.)"], [2000, 6504]),
      ]
    }),

    ], // end front-matter children
  },

  // ═══════════════════════════════════════════════════════════════
  // SECTION 3 — CHAPTERS (Arabic numerals)
  // ═══════════════════════════════════════════════════════════════
  {
    properties: { page: { size: PAGE, margin: MARGIN, pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } } },
    ...pgFooter(),
    children: [

    // ═══════════════════════════════════════════════════════════════
    // CHAPTER 1 — INTRODUCTION
    // ═══════════════════════════════════════════════════════════════
    ...chTitle("CHAPTER 1: INTRODUCTION"),

    sh("1.1 Overview of the Project"),
    bp("The manner in which organizations handle documentary evidence, academic submissions, and written intellectual output has changed dramatically over the past two decades. Where physical documents once allowed relatively straightforward verification of originality, the shift to digital formats has introduced new complexities. A student today can produce a document that shares no single word with a published source yet borrows its entire intellectual substance; a legal professional may receive a contract clause that is functionally identical to a precedent yet lexically distinct from it. These scenarios expose a foundational weakness in how document integrity has traditionally been assessed."),
    blk(),
    bp("DocSimilarity was conceived to address this weakness directly. It is a comprehensive, end-to-end web application that moves document comparison from the realm of character counting into the domain of conceptual understanding. Rather than asking whether two documents share the same vocabulary, the system asks a fundamentally more useful question: do these documents convey the same meaning? This shift is not merely philosophical; it has practical and measurable consequences for detection accuracy, as the experimental results in Chapter 5 demonstrate."),
    blk(),
    bp("The technical approach centres on the all-MiniLM-L6-v2 Sentence-Transformer model, a neural network that has been trained to encode entire sentences and paragraphs as compact mathematical vectors in a 384-dimensional space. In this space, two pieces of text that express the same idea — whether using identical words, complete synonyms, or entirely restructured sentences — are represented by vectors that point in similar directions. The angle between these vectors, measured through Cosine Similarity, provides a reliable and mathematically grounded similarity score."),
    blk(),
    bp("To ensure that the system is useful across the varied formats in which information actually exists within institutions, the application incorporates a multi-modal extraction pipeline. Plain text, structured PDF documents, Microsoft Word DOCX files, and scanned image files — which might represent photographs of handwritten or printed pages — are all handled through a unified processing architecture. Image-based inputs are processed through an Optical Character Recognition engine before entering the same analytical pipeline as digital text."),
    blk(),
    bp("A distinctive design choice that sets DocSimilarity apart from commercially available alternatives is its strictly local deployment model. The machine learning inference engine runs entirely on the host machine; documents are never transmitted to external servers or third-party cloud APIs. This design gives institutions complete control over their data and makes the system suitable for environments where data privacy and document confidentiality are non-negotiable requirements."),
    blk(),
    bp("The application is built on a three-tier decoupled architecture. The frontend is developed in React.js with Tailwind CSS, presenting similarity results through a dynamic radial gauge, a real-time processing audit log, and a paginated history dashboard. The backend is implemented in Python using FastAPI, which provides native asynchronous processing capabilities suited to the computational demands of machine learning inference. MongoDB serves as the persistence layer, storing analysis metadata for longitudinal review and audit purposes."),
    blk(),
    bp("This project also served as an applied learning exercise for the development team, providing hands-on engagement with a broad range of Information Technology disciplines: machine learning model deployment, full-stack web development, RESTful API design, database schema planning, Optical Character Recognition integration, and software testing methodology. Each of these domains contributed to the shape of the final system and is reflected in the chapters that follow."),

    sh("1.2 Motivation and Background"),
    bp("The motivation for building DocSimilarity emerged from a convergence of observed problems in three distinct domains: academia, legal practice, and corporate data management. While the specific manifestations of the problem differ across these domains, they share a common root: existing document comparison tools are not equipped to detect conceptual similarity when surface-level vocabulary has been altered."),
    blk(),
    bp("Within academic institutions, the most pressing concern is the evolution of plagiarism strategies. A decade ago, the dominant form of academic misconduct involved copying text with minor modifications — changing a few words, reordering sentences within a paragraph, or adding a superficial introductory phrase. Keyword-based detectors, for all their limitations, were reasonably effective against these strategies because some lexical trace of the original typically remained. The situation changed materially with the widespread availability of AI paraphrasing tools. These tools can now take a paragraph of source text and produce a semantically equivalent restatement in which no individual word is shared with the original. The resulting output appears to a keyword detector as wholly original content."),
    blk(),
    bp("The problem is compounded in Indian academic institutions by the multilingual nature of the student population. A student may conduct research and gather understanding from English-language sources, then express that understanding in a submission that uses different vocabulary. While this process, when performed genuinely, is exactly what academic learning looks like, the boundary between legitimate synthesis and unacknowledged appropriation becomes harder to locate when detection tools can only look at word overlap."),
    blk(),
    bp("In legal and corporate contexts, the need for document comparison arises in different circumstances. Legal professionals drafting or reviewing contracts frequently need to identify whether a proposed clause is substantively equivalent to a precedent clause from a previous agreement, even when the specific wording has been changed by the opposing party. This task, performed manually, is time-consuming and prone to error. In corporate settings, document deduplication — identifying when a newly submitted report, policy document, or technical specification is essentially a restatement of an existing document — requires tools that understand content rather than counting token overlap."),
    blk(),
    bp("A third motivating factor is the data privacy problem inherent in existing commercial solutions. Turnitin, iThenticate, and similar platforms operate on a submission model: users upload their documents to the provider's servers, where analysis is performed. For documents containing unpublished research, proprietary business information, confidential legal matter, or sensitive personal data, this model requires institutions to trust a third party with information they may not be authorized to share. The privacy and data sovereignty risks associated with this model are substantial, yet no widely adopted alternative existed that combined high semantic accuracy with local, private deployment."),
    blk(),
    bp("Finally, there is a purely technological motivation. The maturation of lightweight transformer models through knowledge distillation — the process of training a compact model to approximate the behaviour of a much larger one — has made it feasible to deploy state-of-the-art semantic understanding on standard consumer hardware without GPU acceleration. The all-MiniLM-L6-v2 model represents this maturation; it delivers semantic accuracy approaching that of a full-scale BERT model while requiring only a fraction of the computational resources. This feasibility, combined with the practical accessibility of frameworks like FastAPI and React.js, made the construction of a locally deployable, high-accuracy semantic comparison tool genuinely achievable as an academic project."),

    sh("1.3 Problem Statement"),
    bp("The fundamental problem addressed by this project can be stated concisely: no widely available, locally deployable document comparison tool exists that combines high-accuracy semantic similarity detection, multi-format file support, and absolute data privacy within a single integrated platform."),
    blk(),
    bp("This statement encompasses three distinct and independently significant problems. The first is the analytical inadequacy of lexical matching. When a comparison system evaluates similarity by measuring the overlap of words or n-grams between two documents, it implicitly assumes that linguistic similarity is a reliable proxy for conceptual similarity. This assumption was never fully warranted — synonyms, near-synonyms, and domain-specific jargon have always introduced noise — but it has become increasingly untenable as AI-assisted paraphrasing has made it trivially easy to produce lexically novel restatements of existing content."),
    blk(),
    bp("The second problem is format fragmentation. Information does not exist exclusively in clean, machine-readable digital text. A substantial portion of the documents that institutions need to compare arrives as scanned images, non-searchable PDFs produced by photocopying, or image files photographed on mobile devices. Existing tools that handle only machine-readable formats require users to pass documents through separate OCR conversion services before they can be compared. Each such conversion step introduces an additional point of potential data leakage and an additional opportunity for quality degradation."),
    blk(),
    bp("The third problem is the false choice between accuracy and privacy. Commercial tools with high semantic accuracy require cloud submission of documents. Local tools with privacy preservation typically rely on older, less accurate detection methods. DocSimilarity eliminates this false choice by demonstrating that a locally deployed machine learning model can achieve semantic accuracy comparable to cloud-based commercial solutions."),
    blk(),
    bp("The impact of these problems, when they occur together in institutional settings, is significant. Academic integrity is undermined when detection tools can be trivially evaded through AI paraphrasing. Legal and compliance risk increases when contract review relies on tools that miss conceptually equivalent clauses expressed in different words. Data governance obligations are compromised when privacy-sensitive documents must be transmitted to third-party analysis servers. DocSimilarity addresses all three of these impact pathways through a single, integrated technical solution."),

    sh("1.4 Scope and Boundaries"),
    bp("The scope of this project covers the complete design, development, testing, and deployment of a one-to-one document comparison web application with semantic similarity detection capability. The term one-to-one refers to the comparison of exactly two documents in a single analysis session, which is the primary use case in academic submission review and contract clause comparison."),
    blk(),
    bp("Within this scope, the application handles four input modalities: plain text entered directly through the interface, PDF files generated digitally or produced by scanning, DOCX files in Microsoft Word Open XML format, and raster image files in JPEG or PNG format that contain printed or handwritten text. The extraction pipeline for each modality is distinct but converges at the text normalization stage, after which all inputs are treated identically by the embedding and comparison components."),
    blk(),
    bp("The analytical scope is intentionally focused. The system produces a single document-level similarity score representing the cosine similarity of the two embedding vectors, expressed as a percentage. It does not produce paragraph-level heatmaps, sentence-level matching, or citation analysis. These more granular analyses are identified as future enhancements."),
    blk(),
    bp("The project scope explicitly excludes one-to-many comparison, cross-language analysis, real-time collaborative editing features, and integration with Learning Management Systems. These capabilities are architecturally compatible with the system's modular design but fall outside the boundaries of the current implementation."),

    sh("1.5 Project Organization"),
    bp("This report is structured across six principal chapters. Chapter 1 establishes the context, motivation, problem definition, and scope of the project. Chapter 2 reviews relevant literature, tracing the intellectual history of text similarity detection from early statistical methods through neural embeddings to the transformer architectures that underpin the current system. Chapter 3 formalizes the research objectives and specifies both functional and non-functional system requirements. Chapter 4 describes the complete methodology, encompassing architecture decisions, the document processing pipeline, the mathematical basis of cosine similarity, data modeling, and security design. Chapter 5 presents empirical results including performance benchmarks, accuracy comparisons, interface descriptions, and user acceptance testing findings. Chapter 6 summarizes the project outcomes, identifies limitations, and proposes a structured roadmap for future development. Three appendices follow, providing the complete system algorithm, project mapping documentation, and the supervisor's similarity check certificate."),

    // ═══════════════════════════════════════════════════════════════
    // CHAPTER 2 — LITERATURE REVIEW
    // ═══════════════════════════════════════════════════════════════
    ...chTitle("CHAPTER 2: LITERATURE REVIEW"),

    sh("2.1 Historical Development of Text Similarity Methods"),
    bp("The automated comparison of textual documents has roots that predate modern computing. Early methods were developed within information retrieval research, where the practical goal was identifying which documents in a collection were relevant to a given query. The challenge of measuring document similarity is a special case of the more general problem of measuring the distance between structured data objects, and the field drew upon mathematical foundations from set theory, linear algebra, and probability theory as it evolved."),
    blk(),
    bp("The Jaccard Similarity Coefficient, originally formulated by Paul Jaccard in 1901 for the comparison of botanical species distributions, was among the first formal measures to be applied to document comparison. Applied to text, the Jaccard measure treats each document as a set of unique tokens and computes the ratio of the token intersection to the token union. Its appeal lies in its simplicity and its intuitive interpretation: a Jaccard score of 1.0 means the two documents use exactly the same vocabulary; a score of 0.0 means they share no words at all. The critical limitation is equally intuitive: the measure is entirely insensitive to word frequency, word order, and word meaning. Two documents composed from identical vocabularies will receive a Jaccard score of 1.0 regardless of whether they communicate the same ideas."),
    blk(),
    bp("The Bag of Words model, which emerged from early computational linguistics, addressed the frequency blindness of the Jaccard measure by representing documents as vectors in which each dimension corresponds to a unique term in the vocabulary and the value in each dimension represents the frequency of that term. This representation enabled the application of vector space mathematics to document comparison and formed the foundation upon which TF-IDF was later built."),
    blk(),
    bp("TF-IDF, which stands for Term Frequency multiplied by Inverse Document Frequency, introduced a weighting scheme that distinguished between words that were merely common in a specific document and words that were genuinely distinctive. A word like 'the' that appears frequently across all documents in a corpus receives a low weight because its high document frequency reduces its discriminative value. A technical term that appears frequently in one document but rarely across the corpus receives a high weight because its presence is genuinely informative about the document's subject matter. TF-IDF representations significantly improved the quality of document retrieval systems and remain widely used in search engine applications today."),
    blk(),
    bp("Despite its advances over raw frequency counting, TF-IDF preserves the fundamental limitation of all lexical methods: it operates on the assumption that words are atomic, discrete symbols rather than carriers of meaning. The word 'important' and the word 'significant' are treated as completely distinct dimensions in a TF-IDF vector space, despite the fact that any competent reader would recognize them as semantically equivalent. This limitation is not a flaw in the mathematical formulation of TF-IDF; it is a consequence of the information available to a purely lexical system."),
    blk(),
    bp("N-gram based similarity measures attempted to capture some local word order information by treating sequences of N consecutive words as atomic units. Bigrams (pairs of consecutive words) and trigrams (triples) can capture some phrasal information that is invisible to unigram-based methods. However, N-gram methods scale poorly with vocabulary size and remain insensitive to global semantic equivalence between phrases that use different word sequences to convey the same meaning."),

    sh("2.2 From Static Word Vectors to Contextual Embeddings"),
    bp("The development of neural word embedding models in the early 2010s represented the most significant advance in computational text representation since TF-IDF. The central insight of models like Word2Vec (Mikolov et al., 2013) and GloVe (Pennington et al., 2014) was that a word's meaning could be approximated by the company it keeps: words that consistently appear in similar contexts tend to have similar meanings, and this co-occurrence pattern can be captured by training a neural network to predict words from their context."),
    blk(),
    bp("Word2Vec employs two training architectures: Continuous Bag of Words, which predicts a target word from its surrounding context words, and Skip-gram, which predicts context words from a target word. Both architectures, through backpropagation against a large text corpus, converge on dense vector representations in which semantically related words cluster together in the embedding space. The classic demonstration of this property is the vector arithmetic showing that the result of subtracting the vector for 'man' from the vector for 'king' and adding the vector for 'woman' approximates the vector for 'queen'."),
    blk(),
    bp("GloVe (Global Vectors for Word Representation) approached the same goal from a different direction, constructing word vectors by factorizing a word-word co-occurrence matrix derived from a large corpus. While the training methodology differs from Word2Vec, the resulting representations share the same key property: semantic proximity in the vector space reflects semantic proximity in meaning."),
    blk(),
    bp("These static embedding models represented a genuine breakthrough, but they carried an important limitation: each word received a single, fixed vector regardless of context. The word 'bank' receives the same vector in 'the river bank' and 'the bank account', despite these uses involving entirely different semantic fields. For document comparison purposes, this context-insensitivity meant that documents discussing banking and documents discussing rivers might be incorrectly identified as semantically related if they shared contextually ambiguous vocabulary."),
    blk(),
    bp("The Transformer architecture, introduced by Vaswani et al. (2017) in the landmark paper 'Attention Is All You Need', resolved the context-insensitivity problem through a mechanism called multi-head self-attention. Rather than computing a fixed representation for each word, the Transformer computes dynamic representations in which the contribution of each word to the representation of every other word in the sequence is weighted by a learned attention function. This means that the representation of the word 'bank' in 'river bank' is genuinely different from its representation in 'savings bank', because the attention mechanism considers the entire surrounding context when constructing each token's representation."),

    sh("2.3 Sentence-Level Semantic Representations"),
    bp("The Transformer architecture was initially applied most successfully to token-level tasks, where the goal is to produce a representation for each individual word or sub-word token. BERT (Bidirectional Encoder Representations from Transformers, Devlin et al., 2018) demonstrated that pre-training a deep Transformer encoder on large text corpora using masked language modelling and next sentence prediction, followed by fine-tuning on specific downstream tasks, could achieve state-of-the-art performance across a diverse range of NLP benchmarks."),
    blk(),
    bp("However, applying BERT to document similarity presented a challenge. BERT was designed to produce token-level representations, and while a sentence-level representation can be obtained by pooling these token representations (for instance, by taking the representation of the special classification token), the resulting sentence embeddings are not well-suited to semantic similarity measurement. Two sentences that are semantically equivalent do not necessarily produce similar pooled BERT representations when the model has been trained only on the masked language modelling objective."),
    blk(),
    bp("Sentence-BERT (SBERT, Reimers and Gurevych, 2019) addressed this limitation by fine-tuning BERT with a siamese network training objective specifically designed to produce sentence embeddings that are suitable for similarity measurement. In the siamese network setup, two instances of the same BERT model process two input sentences independently, producing two fixed-size sentence embeddings. The training objective encourages the model to produce embeddings that are close in vector space when the sentences are semantically related and distant when they are not. Fine-tuning on semantic textual similarity datasets and natural language inference datasets transforms the base BERT model into a system that produces sentence-level representations specifically calibrated for comparison tasks."),
    blk(),
    bp("For DocSimilarity, the all-MiniLM-L6-v2 model was selected as the primary inference component. This model was produced through knowledge distillation, a training technique in which a smaller student model is trained to reproduce the output representations of a larger, more capable teacher model. The student model in this case — MiniLM — uses only six transformer encoder layers compared to BERT's twelve or twenty-four, resulting in a model that is approximately five times faster at inference while retaining a semantic accuracy that benchmarking studies have shown to be within approximately one percentage point of the full-scale BERT model. This combination of speed and accuracy made it the appropriate choice for a locally deployable, real-time web application."),

    sh("2.4 Privacy and Deployment Challenges in Existing Tools"),
    bp("Commercially available semantic similarity and plagiarism detection tools have evolved significantly in their technical sophistication, but they have not resolved the fundamental tension between analytical accuracy and data privacy. The business model underlying most commercial tools requires that documents be submitted to the provider's infrastructure for analysis. This submission model creates several categories of risk that are particularly significant for institutional users."),
    blk(),
    bp("The first risk category is direct data exposure. When a document is transmitted to a third-party server, the institution loses physical control over that document. While reputable providers maintain contractual commitments regarding data handling, these commitments do not eliminate the risk of unauthorized access through security breaches. For documents containing unpublished research findings, commercially sensitive intellectual property, personal health information, or legally privileged communication, even a small probability of unauthorized access is unacceptable."),
    blk(),
    bp("The second risk category relates to data retention and secondary use. Commercial providers' terms of service frequently include provisions allowing the submitted document to be indexed and used to enrich the provider's reference database. This practice, while commercially logical from the provider's perspective, means that a confidential document submitted for plagiarism checking may subsequently be compared against other users' submissions. The document has effectively been made part of a shared database without explicit consent."),
    blk(),
    bp("The third risk category is regulatory compliance. Institutions in India are subject to data protection frameworks that place obligations on how personal data is handled. Submitting documents containing personal information to foreign cloud providers may place institutions in a legally ambiguous position with respect to these frameworks."),

    sh("2.5 Identification of Research Gaps"),
    bp("The review of existing literature and tools reveals four specific gaps that this project addresses. The first gap is the continued reliance of freely available plagiarism detection tools on lexical matching as their primary detection mechanism. Despite the demonstrated superiority of semantic approaches, the majority of tools accessible to institutions without substantial subscription budgets continue to use bag-of-words or TF-IDF based detection."),
    blk(),
    bp("The second gap is the absence of a locally deployable, high-accuracy semantic similarity tool. While cloud-based semantic detection tools exist, no widely adopted solution offers comparable accuracy with complete local deployment and zero data transmission to external parties."),
    blk(),
    bp("The third gap is the format fragmentation problem. Most available tools handle only machine-readable text formats. The lack of integrated OCR support means that scanned documents — a common format for handwritten assignments, printed examination answer sheets, and legacy archival documents — cannot be directly compared without preprocessing through additional tools."),
    blk(),
    bp("The fourth gap is the absence of a unified platform that addresses all three of the above gaps simultaneously. Solutions that address one or two of these gaps exist, but none addresses all three within a single, integrated, locally deployable application."),

    sh("2.6 Synthesis and Proposed Direction"),
    bp("The literature reviewed in this chapter converges on a clear technical direction for addressing the identified gaps. Knowledge-distilled transformer models such as MiniLM provide semantic accuracy approaching that of full-scale BERT at inference speeds compatible with real-time web application use. Local model deployment using inference frameworks is technically straightforward on standard consumer hardware. OCR integration using established tools like Tesseract is well-documented and provides reliable text extraction from image inputs. Asynchronous web frameworks like FastAPI are well-suited to handling the concurrent demands of a multi-user comparison service. Document-oriented databases like MongoDB accommodate the heterogeneous metadata that different comparison scenarios produce."),
    blk(),
    bp("DocSimilarity synthesizes these directions into a single, coherent application, demonstrating that a locally deployable semantic document comparison tool meeting all four gap criteria can be built and validated within the scope of an undergraduate final-year project. The implementation decisions made in pursuit of this synthesis are documented in detail in Chapter 4."),

    // ═══════════════════════════════════════════════════════════════
    // CHAPTER 3 — PROBLEM STATEMENT AND OBJECTIVES
    // ═══════════════════════════════════════════════════════════════
    ...chTitle("CHAPTER 3: PROBLEM STATEMENT AND OBJECTIVES"),

    sh("3.1 Formal Problem Definition"),
    bp("The problem addressed by DocSimilarity can be formally stated as follows: given two document inputs D1 and D2, each of which may be provided in any of a defined set of formats F = {plain text, PDF, DOCX, JPEG image, PNG image}, determine a similarity score S in the range [0, 100] such that S reflects the degree of semantic equivalence between the information content of D1 and D2, independent of the specific vocabulary, sentence structure, or format in which that information is expressed. The computation of S must be performed locally on the host machine, with no transmission of D1 or D2 to any external system."),
    blk(),
    bp("This formal definition highlights three properties that distinguish the problem from conventional text comparison: semantic independence from surface form, multi-modal input handling, and local computation. Each of these properties introduces specific technical requirements."),
    blk(),
    bp("Semantic independence from surface form requires a representation of document content that captures meaning rather than vocabulary. This requirement rules out all lexical matching approaches and mandates the use of a neural language model capable of producing contextual representations. The choice of model must balance accuracy against inference speed and memory requirements, given the local deployment constraint."),
    blk(),
    bp("Multi-modal input handling requires distinct extraction pipelines for each supported format, with a common interface at the output of each pipeline so that the downstream comparison process treats all inputs uniformly. The OCR pipeline for image inputs introduces additional complexity in the form of image preprocessing requirements, which must be designed to maximize character recognition accuracy across a range of document quality levels."),
    blk(),
    bp("Local computation requires that all components of the system — the extraction pipeline, the normalization process, the embedding model, and the comparison mathematics — execute within the host machine's computational environment. This constraint has implications for model selection (favouring smaller, faster models), framework choice (favouring those that support efficient CPU inference), and architecture design (avoiding any network calls to external APIs during the analysis workflow)."),

    sh("3.2 Research Objectives"),
    bp("Four specific research objectives guide the development of DocSimilarity, each addressing a distinct component of the formal problem definition:"),
    blk(),
    bp("Objective 1 — Locally Deployed Semantic Inference: To implement a locally hosted Sentence-Transformer inference pipeline using the all-MiniLM-L6-v2 model that operates entirely on the host machine's hardware, produces 384-dimensional embedding vectors for input text strings, and completes inference within a time frame compatible with interactive web application use without requiring GPU acceleration."),
    blk(),
    bp("Objective 2 — Asynchronous Multi-Modal Backend: To design and implement an asynchronous Python backend using FastAPI that accepts simultaneous submissions of two files in any supported format, correctly identifies the format of each file through MIME type inspection, routes each file to the appropriate extraction module, and manages concurrent requests without blocking during computationally intensive extraction or inference steps."),
    blk(),
    bp("Objective 3 — Integrated OCR for Image Inputs: To integrate a PyTesseract OCR pipeline incorporating grayscale conversion and adaptive thresholding preprocessing, enabling the system to extract machine-readable text from scanned raster image documents with sufficient accuracy to support meaningful semantic comparison."),
    blk(),
    bp("Objective 4 — Intuitive Visual Presentation: To develop a React.js frontend that communicates the similarity score and analysis metadata in a form accessible to users without mathematical or machine learning expertise, employing a dynamic radial gauge with colour-coded interpretation thresholds and a real-time processing audit log."),

    sh("3.3 Functional Requirements"),
    bp("The following functional requirements specify the mandatory operational capabilities of the system. Each requirement is stated in terms of observable behaviour rather than implementation mechanism, to allow flexibility in how the requirement is met during development."),
    blk(),
    bp("FR-1: The system shall provide a user interface through which a user can select and submit exactly two files for comparison in a single operation. The interface shall clearly indicate the set of accepted file formats and provide visual confirmation of each file's receipt."),
    blk(),
    bp("FR-2: Upon receiving two files, the system shall determine the format of each file by inspecting its MIME type and route it to the extraction module appropriate for that format. If a submitted file is of an unsupported format, the system shall return an informative error message identifying the unsupported format and listing the accepted formats."),
    blk(),
    bp("FR-3: The system shall extract machine-readable text from each submitted file. For PDF inputs, this shall be accomplished using a page-iterating text extraction approach. For DOCX inputs, this shall be accomplished by traversing paragraph elements. For image inputs, this shall be accomplished using OCR following grayscale and thresholding preprocessing. For plain text inputs, this shall be accomplished through direct UTF-8 decoding."),
    blk(),
    bp("FR-4: The system shall normalize extracted text by converting to lowercase, removing control characters, eliminating excessive whitespace, and stripping formatting artifacts introduced by the extraction process."),
    blk(),
    bp("FR-5: The system shall generate 384-dimensional embedding vectors for both normalized text strings using the all-MiniLM-L6-v2 model and compute a Cosine Similarity score, expressed as a percentage between 0.0 and 100.0."),
    blk(),
    bp("FR-6: The system shall persist a record of each completed analysis in the MongoDB database, including the filenames, file types, word counts, similarity score, processing duration, and timestamp."),
    blk(),
    bp("FR-7: The system shall provide a history view from which users can retrieve and inspect records of past analyses without resubmitting or reprocessing the original documents."),

    sh("3.4 Non-Functional Requirements"),
    bp("NFR-1 — Performance: Analysis of a standard document not exceeding five hundred words shall complete within one second for text and PDF inputs. For image inputs requiring OCR processing, the analysis shall complete within two seconds. These thresholds apply under normal single-user load conditions on the reference hardware configuration specified in Section 5.1."),
    blk(),
    bp("NFR-2 — Data Privacy: No portion of the content of submitted documents shall be transmitted to any external server, cloud service, or third-party API during or after the analysis process. File content shall exist only in the host machine's RAM during processing and shall not be written to persistent storage. Only the analysis metadata specified in FR-6 shall be persisted."),
    blk(),
    bp("NFR-3 — Modularity: The system architecture shall be organized such that the embedding model, extraction pipeline, similarity computation, and database persistence components are each implemented as independently modifiable service modules with clearly defined interfaces. Replacement of any one component — for instance, substituting the embedding model with a multilingual alternative — shall not require changes to any other component."),
    blk(),
    bp("NFR-4 — Usability: The user interface shall be fully functional across current versions of Chrome, Firefox, Safari, and Edge on both desktop (minimum 1024px width) and mobile (minimum 375px width) screen sizes. The similarity score visualization shall be interpretable without prior knowledge of vector mathematics or NLP concepts."),
    blk(),
    bp("NFR-5 — Reliability: The system shall handle malformed or unreadable input files gracefully, returning descriptive error messages rather than unhandled exceptions. All extraction and inference steps shall be wrapped in exception handlers that log errors and return structured error responses."),
    blk(),
    bp("NFR-6 — Scalability: The modular architecture shall accommodate the addition of new file format extractors and the substitution of alternative embedding models without requiring structural changes to the backend API or frontend interface."),

    // ═══════════════════════════════════════════════════════════════
    // CHAPTER 4 — METHODOLOGY
    // ═══════════════════════════════════════════════════════════════
    ...chTitle("CHAPTER 4: METHODOLOGY"),

    sh("4.1 System Architecture and Technology Selection"),
    bp("DocSimilarity is organized as a three-tier decoupled architecture in which the presentation tier, application tier, and data tier are each implemented as independent components communicating through well-defined interfaces. This architectural pattern was selected over a monolithic design for three reasons: it allows each tier to be scaled, modified, or replaced independently; it enforces separation of concerns that simplifies testing and maintenance; and it aligns with the modular non-functional requirement specified in Section 3.4."),
    blk(),
    bp("Table 4.1 summarizes the technology choices made for each component of the system, along with the version used during development and the rationale for selection."),
    blk(),
    dblk(),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 120, line: LS }, children: [new TextRun({ text: "Table 4.1: Technology Stack and Version Details", font: FONT, size: SZ, bold: true })] }),
    new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: [2000, 2000, 1500, 3004],
      rows: [
        tRow(["Component", "Technology", "Version", "Selection Rationale"], [2000, 2000, 1500, 3004], true),
        tRow(["Frontend", "React.js", "18", "Component-based state management for async UI"], [2000, 2000, 1500, 3004]),
        tRow(["UI Styling", "Tailwind CSS", "3.x", "Utility-first responsive styling"], [2000, 2000, 1500, 3004]),
        tRow(["Backend", "FastAPI (Python)", "0.100+", "Native async support for ML inference tasks"], [2000, 2000, 1500, 3004]),
        tRow(["ML Framework", "PyTorch", "2.0", "Foundation for Sentence-Transformer inference"], [2000, 2000, 1500, 3004]),
        tRow(["Embedding Model", "all-MiniLM-L6-v2", "2.x", "High accuracy at 5x faster inference vs BERT"], [2000, 2000, 1500, 3004]),
        tRow(["OCR Engine", "PyTesseract", "0.3.10", "Mature, open-source LSTM-based OCR"], [2000, 2000, 1500, 3004]),
        tRow(["PDF Parser", "PyPDF2", "3.x", "Pure-Python PDF text extraction"], [2000, 2000, 1500, 3004]),
        tRow(["DOCX Parser", "python-docx", "0.8.x", "Native Open XML paragraph traversal"], [2000, 2000, 1500, 3004]),
        tRow(["Database", "MongoDB", "6.x", "Flexible BSON schema for varied analysis metadata"], [2000, 2000, 1500, 3004]),
        tRow(["Format Detection", "python-magic", "0.4.x", "MIME type identification from byte signatures"], [2000, 2000, 1500, 3004]),
      ]
    }),
    dblk(),
    // FIGURE 4.1 PLACEHOLDER
    dblk(),
    new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: [CW], rows: [new TableRow({ children: [new TableCell({
      borders: tbb, shading: { fill: "F0F4F8", type: ShadingType.CLEAR },
      width: { size: CW, type: WidthType.DXA }, margins: { top: 800, bottom: 800, left: 400, right: 400 },
      children: [
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 40, line: 240 }, children: [new TextRun({ text: "[ INSERT FIGURE 4.1 HERE ]", font: FONT, size: SZ, bold: true, color: "555555" })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 40, after: 120, line: 240 }, children: [new TextRun({ text: "Three-Tier System Architecture Diagram", font: FONT, size: SZ, italics: true, color: "333333" })] }),
      ]
    })]})]}),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 60, after: 240, line: LS }, children: [new TextRun({ text: "Figure 4.1: Three-Tier System Architecture Diagram", font: FONT, size: SZ })] }),
    dblk(),
    bp("The frontend tier is implemented in React.js version 18, using functional components and React Hooks for state management. The component hierarchy separates concerns cleanly: Upload.jsx handles file selection and submission state management; SimilarityGauge.jsx renders the radial SVG visualization; ProcessingAudit.jsx streams backend status messages through an SSE connection; and HistoryDashboard.jsx fetches and displays paginated historical records. Tailwind CSS utility classes provide consistent responsive styling without the overhead of a component library."),
    blk(),
    bp("The application tier is implemented in Python using FastAPI. The selection of FastAPI over Flask or Django was driven by a specific technical requirement: the embedding inference step is computationally intensive, and a synchronous web framework would block the server thread for the full duration of the inference computation. FastAPI's ASGI-based event loop allows the server to initiate an inference coroutine, yield execution control while awaiting the result, and simultaneously service other incoming requests. This non-blocking architecture ensures that one user's analysis does not delay another user's upload or result retrieval."),
    blk(),
    bp("The data tier uses MongoDB, a document-oriented database that stores records as flexible BSON documents. The choice of MongoDB over a relational database was motivated by the heterogeneous structure of analysis metadata: different input format combinations produce different sets of extractable attributes, and enforcing a fixed relational schema would require null fields for attributes inapplicable to certain format combinations. MongoDB's schema-less model accommodates this variability naturally."),

    sh("4.2 Document Processing Pipeline"),
    bp("The document processing pipeline is the central analytical component of the DocSimilarity system. It is coordinated by the pipeline_service module and executes a defined sequence of operations for every comparison request. The pipeline is designed to be stateless: each invocation is independent, and no state from a previous comparison is retained in memory."),
    blk(),
    // FIGURE 4.2 PLACEHOLDER
    dblk(),
    new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: [CW], rows: [new TableRow({ children: [new TableCell({
      borders: tbb, shading: { fill: "F0F4F8", type: ShadingType.CLEAR },
      width: { size: CW, type: WidthType.DXA }, margins: { top: 800, bottom: 800, left: 400, right: 400 },
      children: [
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 40, line: 240 }, children: [new TextRun({ text: "[ INSERT FIGURE 4.2 HERE ]", font: FONT, size: SZ, bold: true, color: "555555" })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 40, after: 120, line: 240 }, children: [new TextRun({ text: "Document Processing Pipeline Flowchart", font: FONT, size: SZ, italics: true, color: "333333" })] }),
      ]
    })]})]}),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 60, after: 240, line: LS }, children: [new TextRun({ text: "Figure 4.2: Document Processing Pipeline Flowchart", font: FONT, size: SZ })] }),
    dblk(),
    bp("Stage 1 — File Reception: Two file objects are received by the FastAPI endpoint as Multipart/Form-Data HTTP payload components. The files are immediately loaded into memory as byte streams. No data is written to the host file system at any point during the pipeline, satisfying the data privacy requirement NFR-2."),
    blk(),
    bp("Stage 2 — MIME Type Detection and Extraction Routing: Each byte stream is passed to the text_extraction_service, which uses the python-magic library to inspect the file's byte signature and determine its MIME type. This approach is more reliable than relying on the file extension provided in the upload, as extensions can be manipulated or absent. Based on the identified MIME type, each file is routed to the appropriate extraction module."),
    blk(),
    bp("Stage 3 — Format-Specific Text Extraction: PDF files are processed by the PyPDF2 library, which iterates through the document's page objects and concatenates the text content extracted from each page. DOCX files are processed by the python-docx library, which traverses the document's paragraph elements and concatenates their text content. Image files (JPEG, PNG, TIFF) are processed through the OCR sub-pipeline described below. Plain text files are processed by direct UTF-8 decoding of the byte stream."),
    blk(),
    bp("Stage 3a — OCR Sub-Pipeline for Image Inputs: When an image file is identified, the byte stream is decoded into a PIL (Python Imaging Library) Image object. A grayscale conversion is applied, which reduces the three-colour channel representation to a single luminance channel and eliminates colour variation that would otherwise interfere with character recognition. Adaptive thresholding is then applied, which converts the grayscale image to a binary black-and-white representation by computing a local threshold for each pixel region based on its neighbourhood. This adaptive approach is more robust than global thresholding for documents with uneven illumination, such as photographs taken under ambient lighting. The preprocessed binary image is passed to PyTesseract, which invokes the Tesseract 4.x LSTM-based character recognition engine to produce a raw text transcript."),
    blk(),
    bp("Stage 4 — Text Normalization: Regardless of the extraction path taken, all raw text strings are passed through the nlp_service normalization pipeline. This pipeline applies a sequence of transformations: Unicode normalization to the UTF-8 encoding; conversion of all characters to their lowercase equivalents for case-insensitive comparison; removal of non-printable control characters using a compiled regular expression; elimination of consecutive whitespace characters and line break sequences; and stripping of PDF-specific line break hyphenation artifacts."),
    blk(),
    bp("Stage 5 — Embedding Generation: Both normalized text strings are passed to the embedding_service, which calls the SentenceTransformer.encode() method of the pre-loaded all-MiniLM-L6-v2 model. The model applies a WordPiece tokenizer to segment each string into sub-word tokens, processes the token sequence through six Transformer encoder layers with multi-head self-attention, applies mean pooling over the final encoder layer's token representations to produce a fixed-size sentence embedding, and L2-normalizes the resulting vector to unit length. The output is a pair of 384-dimensional float32 vectors."),
    blk(),
    bp("Stage 6 — Cosine Similarity Computation: The two embedding vectors are passed to the similarity_service, which computes the dot product of the two vectors (which, because both vectors are L2-normalized, is equivalent to the cosine of the angle between them), multiplies the result by 100.0, and rounds to two decimal places to produce the final percentage similarity score."),
    blk(),
    bp("Stage 7 — Persistence and Response: The similarity score, together with metadata including filenames, detected file types, word counts, processing duration in milliseconds, and a UTC timestamp, are written as a new document to the MongoDB Analysis collection. The complete result payload is returned as a JSON response to the React frontend, which triggers the gauge animation and renders the comparison summary."),

    sh("4.3 Mathematical Foundation: Cosine Similarity"),
    bp("The choice of Cosine Similarity as the comparison metric for document embeddings is grounded in a specific mathematical property that makes it particularly suitable for this application. Unlike Euclidean distance, which measures the straight-line geometric distance between two points in the embedding space and is therefore sensitive to the magnitude of the vectors being compared, Cosine Similarity measures only the angle between two vectors and is entirely independent of their magnitudes."),
    blk(),
    bp("This property is critically important for document comparison because two documents discussing the same topic at different lengths will produce embedding vectors of different magnitudes. A short summary and a comprehensive article on the same subject should produce a high similarity score, but their embedding vectors will differ substantially in magnitude because the longer document's embeddings will typically have larger norms. Cosine Similarity correctly identifies them as similar because the angle between their vectors is small; Euclidean distance would incorrectly suggest dissimilarity because their magnitudes differ."),
    blk(),
    bp("The Cosine Similarity between two vectors A and B is defined as:"),
    blk(),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 240, after: 240, line: LS }, children: [new TextRun({ text: "Cosine Similarity (A, B)  =  (A \u00B7 B)  /  (\u2016A\u2016  \u00D7  \u2016B\u2016)", font: "Courier New", size: SZ, bold: true })] }),
    blk(),
    bp("Where A and B are the 384-dimensional embedding vectors of the two input documents; A \u00B7 B denotes the dot product of the two vectors, computed as the sum of the element-wise products across all 384 dimensions; ||A|| and ||B|| denote the Euclidean norms (magnitudes) of vectors A and B respectively; and the division normalizes the dot product by the product of the two magnitudes."),
    blk(),
    bp("Because the all-MiniLM-L6-v2 model applies L2-normalization as its final encoding step, both output vectors are unit vectors with ||A|| = ||B|| = 1.0. Under this condition, the denominator of the Cosine Similarity formula reduces to 1.0, and the similarity score simplifies to the bare dot product A \u00B7 B. This simplification means that the model's output vectors can be compared through a single matrix multiplication operation, which is computationally efficient."),
    blk(),
    bp("The resulting raw similarity value falls in the range [0, 1] for non-negative embeddings. The system multiplies this by 100 to produce the final percentage score. In the frontend visualization, three interpretation bands are defined: scores below 30% are displayed in green and labelled as Low Similarity; scores between 30% and 70% are displayed in amber and labelled as Moderate Overlap, indicating content that warrants closer review; scores above 70% are displayed in red and labelled as High Similarity, indicating strong semantic equivalence that may represent paraphrased or otherwise appropriated content."),

    sh("4.4 Data Model and Persistence Design"),
    bp("The data persistence layer is built on MongoDB, with all analysis records stored in a single collection named Analysis. Each document in this collection represents one completed comparison event and contains the following fields: a MongoDB-generated ObjectId as the primary key; doc1_filename and doc2_filename storing the original names of the submitted files; doc1_filetype and doc2_filetype storing the detected MIME types; doc1_word_count and doc2_word_count storing the word counts of the extracted text after normalization; similarity_score storing the computed Cosine Similarity percentage as a 64-bit floating point number; processing_duration_ms storing the end-to-end analysis time in milliseconds; and created_at storing the analysis completion timestamp in UTC."),
    blk(),
    // FIGURE 4.3 PLACEHOLDER
    dblk(),
    new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: [CW], rows: [new TableRow({ children: [new TableCell({
      borders: tbb, shading: { fill: "F0F4F8", type: ShadingType.CLEAR },
      width: { size: CW, type: WidthType.DXA }, margins: { top: 800, bottom: 800, left: 400, right: 400 },
      children: [
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 40, line: 240 }, children: [new TextRun({ text: "[ INSERT FIGURE 4.3 HERE ]", font: FONT, size: SZ, bold: true, color: "555555" })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 40, after: 120, line: 240 }, children: [new TextRun({ text: "Data Flow Diagram — Level 1", font: FONT, size: SZ, italics: true, color: "333333" })] }),
      ]
    })]})]}),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 60, after: 240, line: LS }, children: [new TextRun({ text: "Figure 4.3: Data Flow Diagram — Level 1", font: FONT, size: SZ })] }),
    dblk(),
    bp("An embedded SimilarityReport sub-document is stored within each Analysis document, containing the full JSON result payload including individual vector norms and per-stage processing timing data. Embedding this sub-document rather than maintaining a separate collection avoids the need for JOIN-equivalent operations and ensures that all data for a single analysis can be retrieved in a single database query."),

    sh("4.5 Security and Privacy Design"),
    bp("The security architecture of DocSimilarity is governed by a single overriding principle: document content must never leave the host machine's computational environment. This principle is implemented through three specific design decisions."),
    blk(),
    bp("First, the embedding inference engine runs locally. The all-MiniLM-L6-v2 model weights are loaded from a local file path into the host machine's RAM at server startup. All tokenization, Transformer forward passes, and pooling operations execute on the host CPU. There are no network calls to external model hosting services or inference APIs."),
    blk(),
    bp("Second, uploaded files are processed exclusively in memory. When a file is submitted through the React frontend, it is transmitted to the FastAPI backend as a Multipart/Form-Data payload and immediately read into a byte stream object in RAM. The byte stream is passed through the extraction and embedding pipeline and then released. No file content is written to the host file system or stored in the database."),
    blk(),
    bp("Third, the system is designed for deployment within a private network. The FastAPI server exposes its API on a configurable local port, and the production deployment configuration does not expose this port beyond the institution's internal network boundary. All inter-tier communication between the React frontend and the FastAPI backend occurs over the local network, eliminating any external network exposure of document content."),

    // ═══════════════════════════════════════════════════════════════
    // CHAPTER 5 — RESULTS AND DISCUSSION
    // ═══════════════════════════════════════════════════════════════
    ...chTitle("CHAPTER 5: RESULTS AND DISCUSSION"),

    sh("5.1 Development and Testing Environment"),
    bp("All development, functional testing, performance benchmarking, and user acceptance testing were conducted on consumer-grade hardware to validate the feasibility of the system's local deployment model. The reference hardware configuration consisted of an Intel Core i7 (10th Generation) processor running at 2.9 GHz base frequency with a 4.7 GHz boost, 16 GB DDR4 RAM, and a 512 GB SSD storage device. No dedicated graphics processing unit was used at any point during development or evaluation; all machine learning inference executed on the CPU."),
    blk(),
    bp("This hardware choice was deliberate. Demonstrating that the system achieves its performance targets on CPU-only hardware validates the claim that DocSimilarity is deployable on standard institutional computing infrastructure without specialized procurement. The reference configuration is representative of a mid-range institutional desktop workstation."),
    blk(),
    dblk(),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 120, line: LS }, children: [new TextRun({ text: "Table 5.1: Hardware and Software Environment", font: FONT, size: SZ, bold: true })] }),
    new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: [2500, 3000, 3004],
      rows: [
        tRow(["Category", "Specification", "Detail"], [2500, 3000, 3004], true),
        tRow(["Processor", "Intel Core i7-10th Gen", "2.9 GHz base, 4.7 GHz boost"], [2500, 3000, 3004]),
        tRow(["Memory", "16 GB DDR4", "3200 MHz"], [2500, 3000, 3004]),
        tRow(["Storage", "512 GB SSD", "NVMe M.2"], [2500, 3000, 3004]),
        tRow(["GPU", "None", "All inference on CPU"], [2500, 3000, 3004]),
        tRow(["Operating System", "Ubuntu 22.04 LTS", "64-bit (benchmarks); Windows 11 (UI testing)"], [2500, 3000, 3004]),
        tRow(["Python", "3.10.12", "Backend runtime"], [2500, 3000, 3004]),
        tRow(["Node.js", "18.17 LTS", "Frontend build"], [2500, 3000, 3004]),
        tRow(["MongoDB", "6.0.8", "Local instance"], [2500, 3000, 3004]),
        tRow(["Tesseract OCR", "4.1.1", "LSTM engine mode"], [2500, 3000, 3004]),
        tRow(["Browser (UI test)", "Chrome 124", "Primary test browser"], [2500, 3000, 3004]),
      ]
    }),
    dblk(),

    sh("5.2 System Performance Benchmarking"),
    bp("Latency benchmarks were conducted by measuring end-to-end processing time from HTTP request submission at the React frontend to receipt and rendering of the JSON result payload, averaged across twenty consecutive identical submissions for each file format combination. All test documents contained approximately three hundred to five hundred words, representing a typical academic assignment paragraph length. The measurements were taken on the Ubuntu 22.04 environment to minimize background process variability."),
    blk(),
    dblk(),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 120, line: LS }, children: [new TextRun({ text: "Table 5.2: End-to-End Latency Benchmarks by File Type", font: FONT, size: SZ, bold: true })] }),
    new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: [2500, 1800, 2000, 2204],
      rows: [
        tRow(["Comparison Mode", "Avg. Latency", "Std. Dev.", "Bottleneck Stage"], [2500, 1800, 2000, 2204], true),
        tRow(["Text-to-Text", "180 ms", "\u00B118 ms", "Embedding inference"], [2500, 1800, 2000, 2204]),
        tRow(["PDF-to-PDF", "250 ms", "\u00B124 ms", "PyPDF2 extraction"], [2500, 1800, 2000, 2204]),
        tRow(["DOCX-to-DOCX", "230 ms", "\u00B120 ms", "python-docx parsing"], [2500, 1800, 2000, 2204]),
        tRow(["Text-to-PDF", "215 ms", "\u00B122 ms", "Single extraction step"], [2500, 1800, 2000, 2204]),
        tRow(["Image-to-Image (OCR)", "1,340 ms", "\u00B1120 ms", "Tesseract OCR processing"], [2500, 1800, 2000, 2204]),
        tRow(["PDF-to-Image", "1,260 ms", "\u00B198 ms", "OCR on image input"], [2500, 1800, 2000, 2204]),
      ]
    }),
    dblk(),
    bp("Several important observations emerge from these benchmark results. First, the embedding inference step itself contributes only 90 to 110 milliseconds to the total processing time across all modes. This is a direct consequence of the cold-start pre-loading strategy: the all-MiniLM-L6-v2 model weights are loaded from the local models directory into RAM at server startup, rather than being loaded on each request. In naive ML API implementations where model loading is deferred to the first request, the loading latency typically runs between three and five seconds. By pre-loading the model during the FastAPI application initialization phase, all subsequent requests benefit from a warm, ready-to-use model."),
    blk(),
    bp("Second, the OCR pipeline is the dominant latency contributor for image inputs. The Tesseract LSTM character recognition engine requires between 900 and 1100 milliseconds to process a standard A4 document image, regardless of the text density of the input. This latency is inherent to the OCR process and cannot be meaningfully reduced without changing the underlying recognition engine. The 1,200 to 1,500 millisecond total for image comparisons remains within acceptable interactive response bounds for a document analysis application, where users are accustomed to slightly longer processing times for more complex input formats."),
    blk(),
    bp("Third, the real-time processing audit log displayed in the React frontend's ProcessingAudit component ensures that users receive continuous feedback during the OCR phase. Rather than presenting a blank waiting state for over a second, the interface streams status messages including File received, Grayscale filter applied, Tesseract OCR in progress, and Extraction complete, providing a transparent view of the pipeline that prevents the interface from appearing frozen."),
    blk(),
    bp("Memory consumption during analysis peaked at approximately 580 MB of RAM usage on the backend server. This figure includes the all-MiniLM-L6-v2 model weights held in memory, the Python process overhead, and the document content buffers during processing. This figure is well within the capacity of the reference hardware and well below the memory of even entry-level institutional servers."),

    sh("5.3 Accuracy Evaluation and Comparative Analysis"),
    bp("To validate the core technical claim of DocSimilarity — that semantic embedding-based comparison substantially outperforms lexical matching for detecting paraphrased content — a controlled accuracy experiment was designed and executed. Three test cases were constructed, each representing a different category of document relationship. Each test case was evaluated using both DocSimilarity and a reference keyword-based string matcher implementing Jaccard Similarity on tokenized word sets."),
    blk(),
    bp("The three test cases were as follows. Test Case 1 presented two completely identical documents to establish a baseline and confirm that both methods correctly identify direct duplication. Test Case 2 presented a source document and a version in which every domain-specific content word had been replaced with a semantically equivalent synonym, using a combination of a thesaurus and the GPT-4 paraphrasing tool. No sentence structures were changed; only vocabulary was substituted. Test Case 3 presented a source document and a version that had been subjected to comprehensive structural paraphrasing — sentences were restructured, active and passive voice alternated, subordinate clauses were repositioned, and vocabulary was substituted simultaneously."),
    blk(),
    dblk(),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 120, line: LS }, children: [new TextRun({ text: "Table 5.3: Semantic vs. Keyword Detection Accuracy Comparison", font: FONT, size: SZ, bold: true })] }),
    new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: [2500, 1800, 1800, 2404],
      rows: [
        tRow(["Test Case", "Keyword Matcher", "DocSimilarity", "Conclusion"], [2500, 1800, 1800, 2404], true),
        tRow(["Direct copy (identical text)", "100%", "100%", "Both tools correctly detect"], [2500, 1800, 1800, 2404]),
        tRow(["Synonym substitution only", "22%", "91%", "Semantic model vastly superior"], [2500, 1800, 1800, 2404]),
        tRow(["Full structural paraphrase", "12%", "84%", "Keyword tool fails completely"], [2500, 1800, 1800, 2404]),
      ]
    }),
    dblk(),
    bp("The results confirm the core technical thesis unambiguously. In the direct copy scenario, both methods achieve 100%, confirming that the semantic approach does not sacrifice detection capability for exact matches relative to the keyword method. In the synonym substitution scenario, the keyword matcher records 22% — classifying what is in fact a completely paraphrased version of the source document as largely original. DocSimilarity correctly identifies 91% semantic similarity. The reduction from 100% to 91% reflects genuine differences in how the model represents synonym pairs that are not perfect semantic equivalents, which is the expected and appropriate behaviour: the model is not claiming the documents are identical, because they are not — vocabulary choice carries some meaning — but it correctly identifies that they are overwhelmingly similar in content."),
    blk(),
    bp("In the full structural paraphrase scenario, the keyword matcher collapses to 12%. At this level, the system would effectively classify a comprehensively paraphrased document as original content, which represents a complete failure of the detection function. DocSimilarity maintains an 84% detection score for the same input pair. The reduction from 91% in Test Case 2 to 84% in Test Case 3 reflects the additional semantic distance introduced by structural rearrangement, which is again appropriate: structural rearrangement does introduce some variation in how the model represents the content, but the core meaning remains sufficiently consistent to produce a high similarity score."),
    blk(),
    bp("These results have a direct practical implication. An academic submission that has been produced by passing source material through a standard AI paraphrasing tool would score in the range represented by Test Case 3 on DocSimilarity — flagging for review at 84% — while scoring in the range represented by Test Case 3 on a keyword system — passing as original at 12%. The gap of 72 percentage points between these two scores represents the practical difference between effective detection and complete evasion."),

    sh("5.4 User Interface Screens and Interaction Flow"),
    bp("The React.js frontend provides a guided, linear interaction flow that progressively reveals information as the analysis advances through the processing pipeline. Four principal interface screens define the user experience."),
    blk(),
    dblk(),
    new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: [CW], rows: [new TableRow({ children: [new TableCell({
      borders: tbb, shading: { fill: "F0F4F8", type: ShadingType.CLEAR },
      width: { size: CW, type: WidthType.DXA }, margins: { top: 800, bottom: 800, left: 400, right: 400 },
      children: [
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 40, line: 240 }, children: [new TextRun({ text: "[ INSERT YOUR ACTUAL SCREENSHOT — Figure 5.1 ]", font: FONT, size: SZ, bold: true, color: "555555" })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 40, after: 120, line: 240 }, children: [new TextRun({ text: "Upload Interface — Dual File Drop Zones with Format Reference Card", font: FONT, size: SZ, italics: true, color: "333333" })] }),
      ]
    })]})]}),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 60, after: 240, line: LS }, children: [new TextRun({ text: "Figure 5.1: Upload Interface — Dual File Drop Zones with Format Reference Card", font: FONT, size: SZ })] }),
    dblk(),
    bp("The Upload Interface presents two adjacent file drop zones, each clearly labelled for Document 1 and Document 2. A format reference card below the drop zones lists accepted extensions (PDF, DOCX, TXT, JPG, PNG) alongside their corresponding extraction methods. The Compare Documents button at the bottom triggers the multipart HTTP POST submission and transitions the interface to the Processing view."),
    blk(),
    dblk(),
    new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: [CW], rows: [new TableRow({ children: [new TableCell({
      borders: tbb, shading: { fill: "F0F4F8", type: ShadingType.CLEAR },
      width: { size: CW, type: WidthType.DXA }, margins: { top: 800, bottom: 800, left: 400, right: 400 },
      children: [
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 40, line: 240 }, children: [new TextRun({ text: "[ INSERT YOUR ACTUAL SCREENSHOT — Figure 5.2 ]", font: FONT, size: SZ, bold: true, color: "555555" })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 40, after: 120, line: 240 }, children: [new TextRun({ text: "Real-Time Processing Audit Log Screen", font: FONT, size: SZ, italics: true, color: "333333" })] }),
      ]
    })]})]}),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 60, after: 240, line: LS }, children: [new TextRun({ text: "Figure 5.2: Real-Time Processing Audit Log Screen", font: FONT, size: SZ })] }),
    dblk(),
    bp("During the analysis, the ProcessingAudit component streams status messages from the backend in real time, displayed as a scrollable log panel. Messages include File received, MIME type detected as PDF, Routing to PyPDF2 extractor, Extraction complete — 347 words, Generating embeddings, Computing cosine similarity, and Saving to history. This log eliminates the frozen-screen experience that would otherwise occur during the OCR phase for image inputs."),
    blk(),
    dblk(),
    new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: [CW], rows: [new TableRow({ children: [new TableCell({
      borders: tbb, shading: { fill: "F0F4F8", type: ShadingType.CLEAR },
      width: { size: CW, type: WidthType.DXA }, margins: { top: 800, bottom: 800, left: 400, right: 400 },
      children: [
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 40, line: 240 }, children: [new TextRun({ text: "[ INSERT YOUR ACTUAL SCREENSHOT — Figure 5.3 ]", font: FONT, size: SZ, bold: true, color: "555555" })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 40, after: 120, line: 240 }, children: [new TextRun({ text: "Similarity Gauge Result Visualization", font: FONT, size: SZ, italics: true, color: "333333" })] }),
      ]
    })]})]}),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 60, after: 240, line: LS }, children: [new TextRun({ text: "Figure 5.3: Similarity Gauge Result Visualization", font: FONT, size: SZ })] }),
    dblk(),
    bp("The Results view centres on the SimilarityGauge component, an SVG radial dial that animates from 0% to the computed score. The dial arc colour transitions from green for scores below 30%, through amber for scores in the 30% to 70% range, to red for scores exceeding 70%. Beneath the gauge, the numeric percentage is displayed in large type alongside a categorical interpretation label. A comparison summary panel presents extracted metadata for both documents including filename, detected file type, and word count, providing transparency about what was actually processed."),
    blk(),
    dblk(),
    new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: [CW], rows: [new TableRow({ children: [new TableCell({
      borders: tbb, shading: { fill: "F0F4F8", type: ShadingType.CLEAR },
      width: { size: CW, type: WidthType.DXA }, margins: { top: 800, bottom: 800, left: 400, right: 400 },
      children: [
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 40, line: 240 }, children: [new TextRun({ text: "[ INSERT YOUR ACTUAL SCREENSHOT — Figure 5.4 ]", font: FONT, size: SZ, bold: true, color: "555555" })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 40, after: 120, line: 240 }, children: [new TextRun({ text: "History Dashboard — Paginated Analysis Records", font: FONT, size: SZ, italics: true, color: "333333" })] }),
      ]
    })]})]}),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 60, after: 240, line: LS }, children: [new TextRun({ text: "Figure 5.4: History Dashboard — Paginated Analysis Records", font: FONT, size: SZ })] }),
    dblk(),
    bp("The History Dashboard tab renders a paginated table of all completed analyses retrieved from the MongoDB collection, displaying the date and time of each analysis, the names and types of both submitted files, their respective word counts, and the computed similarity score. Each row includes a View Details control that expands the full result payload. Because the history is stored persistently in MongoDB, it remains accessible across browser sessions and application restarts, providing a longitudinal audit trail of all analyses conducted on the installation."),

    sh("5.5 User Acceptance Testing Feedback"),
    bp("User acceptance testing was conducted with a group of fifteen participants drawn from the student and faculty population of the Department of Information Technology at Panipat Institute of Engineering and Technology. Participants were asked to complete three defined tasks — comparing two digital PDF documents, comparing a scanned image document against a digital text file, and reviewing the history dashboard — and then to rate the system on seven criteria using a five-point Likert scale."),
    blk(),
    dblk(),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 120, line: LS }, children: [new TextRun({ text: "Table 5.4: User Acceptance Testing Scores (N=15, 5-point Likert scale)", font: FONT, size: SZ, bold: true })] }),
    new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: [5000, 1752, 1752],
      rows: [
        tRow(["Evaluation Criterion", "Mean Score", "Std. Dev."], [5000, 1752, 1752], true),
        tRow(["Overall interface clarity and visual design", "4.5 / 5.0", "0.51"], [5000, 1752, 1752]),
        tRow(["Ease of file upload and submission", "4.6 / 5.0", "0.49"], [5000, 1752, 1752]),
        tRow(["Interpretability of the similarity gauge", "4.3 / 5.0", "0.58"], [5000, 1752, 1752]),
        tRow(["Usefulness of the processing audit log", "4.2 / 5.0", "0.63"], [5000, 1752, 1752]),
        tRow(["Confidence in data privacy (local processing)", "4.7 / 5.0", "0.45"], [5000, 1752, 1752]),
        tRow(["Utility of the history dashboard", "4.1 / 5.0", "0.68"], [5000, 1752, 1752]),
        tRow(["Overall system satisfaction", "4.4 / 5.0", "0.52"], [5000, 1752, 1752]),
      ]
    }),
    dblk(),
    bp("The highest-rated criterion was confidence in data privacy, with a mean score of 4.7 out of 5.0. Participants consistently cited the explicitly communicated local processing model as a significant advantage over commercial tools they had previously used, particularly for the comparison of examination answer scripts and unpublished project work. The processing audit log, while appreciated for its transparency, received the lowest mean score of 4.2, with several participants suggesting that the technical terminology of some status messages (for example, Grayscale filter applied and MIME type detected) was unfamiliar to non-technical users. This feedback has been incorporated into the future enhancement roadmap as a recommendation to offer simplified status messages alongside technical ones."),
    blk(),
    bp("Qualitative feedback gathered through post-testing interviews highlighted three areas for future improvement: the desire to compare more than two documents in a single session; the wish to see which specific sections of the two documents drove the high similarity score, rather than a single aggregate score; and the request for an email notification feature for completed analyses submitted in batch mode. These are all architecturally feasible enhancements that are addressed in the future scope section."),

    // ═══════════════════════════════════════════════════════════════
    // CHAPTER 6 — CONCLUSION AND FUTURE SCOPE
    // ═══════════════════════════════════════════════════════════════
    ...chTitle("CHAPTER 6: CONCLUSION AND FUTURE SCOPE"),

    sh("6.1 Summary of Outcomes"),
    bp("DocSimilarity has accomplished the four research objectives defined in Chapter 3 and has done so within the technical and resource constraints of an undergraduate final-year project. The locally deployed all-MiniLM-L6-v2 inference engine operates without dependency on any external API, achieving embedding generation in approximately 90 to 110 milliseconds per document on standard consumer hardware. The FastAPI asynchronous backend correctly handles all four supported file formats without blocking concurrent requests. The PyTesseract OCR pipeline successfully extracts machine-readable text from raster image inputs. The React.js visual dashboard communicates similarity scores through a colour-coded radial gauge accessible to users without mathematical or machine learning expertise."),
    blk(),
    bp("The comparative accuracy analysis produced its most important finding: a 69 percentage point accuracy advantage over keyword-based detection for fully synonym-substituted documents (91% versus 22%), and a 72 percentage point advantage for structurally paraphrased documents (84% versus 12%). These figures are not marginal improvements; they represent the difference between a system that detects paraphrase-based academic misconduct and a system that is completely blind to it. This is the core contribution of the project to its intended application domain."),
    blk(),
    bp("User acceptance testing produced consistently positive feedback, with overall satisfaction rated at 4.4 out of 5.0 across fifteen participants. The data privacy criterion, reflecting the system's local processing model, received the highest rating of 4.7, confirming that the privacy-first architectural decision resonates strongly with the target user population."),
    blk(),
    bp("Beyond its application-domain contributions, DocSimilarity demonstrates a broader architectural principle: that production-grade machine learning intelligence can be deployed locally, on standard consumer hardware, within a full-stack web application, without sacrificing detection accuracy, user experience quality, or data privacy. This demonstration has implications for any institution seeking to integrate AI-powered analytics into sensitive document workflows without accepting the data sovereignty risks of cloud-hosted solutions."),

    sh("6.2 Key Innovations"),
    bp("Cold-Start Elimination Through Pre-Loading: The most immediately impactful engineering innovation in DocSimilarity is the model pre-loading strategy. By loading the all-MiniLM-L6-v2 model weights into RAM during the FastAPI application startup phase — before any user request is received — the system eliminates the three to five second model loading latency that would otherwise occur on the first inference request. Every subsequent request, for the lifetime of the server process, benefits from an already-initialized model. This design decision reduces the user-visible response time for the first comparison from approximately four to five seconds to approximately 180 to 250 milliseconds, a reduction that is crucial for the interactive usability of the application."),
    blk(),
    bp("Zero-Cloud Document Processing: The architectural decision to host the inference model locally and process document content exclusively in RAM, with no disk writes and no external network calls, constitutes a security and privacy innovation relative to the current state of practice. While the individual technical components of this design — local model inference, in-memory processing, private network deployment — are individually not novel, their systematic combination into a coherent, high-accuracy document analysis application is a meaningful practical contribution. The system proves that the false choice between accuracy and privacy that characterizes the current commercial tool landscape can be eliminated."),
    blk(),
    bp("Multi-Modal Parity Pipeline: The extraction pipeline treats a scanned photograph of a printed assignment and a digitally composed PDF as analytically equivalent inputs. After their respective extraction paths — OCR for the image, PyPDF2 for the PDF — both are reduced to the same normalized string representation before entering the embedding engine. The format difference is completely abstracted away at the extraction layer. This multi-modal parity enables direct comparison across format boundaries that most existing tools cannot bridge."),

    sh("6.3 Social and Academic Impact"),
    bp("The deployment of DocSimilarity in academic institutions addresses a problem with direct consequences for educational equity and the integrity of credentials. When AI paraphrasing tools allow students to submit work that is conceptually appropriated from published sources but lexically novel enough to evade conventional detection, the result is not merely an ethical problem for the individual student involved. It introduces a competitive disadvantage for students who complete work honestly, and it degrades the signalling value of academic credentials by allowing some graduates to obtain those credentials without demonstrating the competencies the credentials are intended to certify."),
    blk(),
    bp("By providing educators with a tool that detects paraphrase-based appropriation with 84% to 91% accuracy depending on paraphrasing intensity, DocSimilarity restores a meaningful degree of detection capability to academic integrity enforcement at a time when that capability has been substantially eroded by AI tool availability. The system's local deployment model makes it accessible to institutions without the subscription budgets required for commercial alternatives, and its privacy-first architecture makes it suitable for environments where document confidentiality requirements would otherwise preclude the use of cloud-based tools."),
    blk(),
    bp("The project also contributes to the Sustainable Development Goals of the United Nations in two specific ways. It contributes to SDG 4 (Quality Education) by strengthening the mechanisms through which educational institutions can ensure that the qualifications they award genuinely represent the competencies of their recipients. It contributes to SDG 9 (Industry, Innovation, and Infrastructure) by demonstrating a practical, deployable example of how state-of-the-art AI capabilities can be embedded into institutional infrastructure without cloud dependency, reducing the technology access barrier for organizations with limited resources."),

    sh("6.4 Limitations of the Present System"),
    bp("The most significant technical limitation of DocSimilarity in its current form is the 512-token input constraint imposed by the all-MiniLM-L6-v2 model. One token in the WordPiece tokenizer used by this model corresponds approximately to three to four characters of text, meaning that the effective input limit is approximately 350 to 400 words. Documents exceeding this length are processed through a chunking strategy: the text is divided into overlapping segments, embeddings are generated for each segment, and the mean of all segment embeddings is used as the document-level representation. While this approach extends the system's practical handling capacity to documents of arbitrary length, the averaging operation introduces a specific limitation: the document-level embedding becomes less sensitive to the semantic characteristics of individual sections as the number of chunks increases. A very long document with one highly distinctive section may receive a lower similarity score relative to a short document focused exclusively on that section than the human reader's intuition would suggest is appropriate."),
    blk(),
    bp("A second limitation is the one-to-one comparison constraint. The system is designed to compare exactly two documents in each analysis session. Institutional use cases frequently require one-to-many screening, where a single submission is compared against an entire corpus of previously submitted documents. The current architecture does not support this use case without manual repeated submission."),
    blk(),
    bp("A third limitation is the English-language focus of the all-MiniLM-L6-v2 model. Documents in Hindi, Punjabi, or other regional languages used in the Indian academic context will produce embedding vectors of lower quality, potentially reducing the accuracy of similarity detection for such documents."),
    blk(),
    bp("A fourth limitation is the absence of granular, section-level similarity reporting. The system produces a single document-level score. Users cannot currently identify which specific paragraphs or sections of the two documents are most semantically similar, information that would be valuable for educators seeking to understand the nature and extent of potential appropriation."),

    sh("6.5 Future Enhancement Roadmap"),
    bp("The following enhancements are identified as the most impactful directions for future development, organized by estimated implementation complexity:"),
    blk(),
    bp("Near-Term (1 to 3 months): The most immediately impactful near-term enhancement would be the implementation of section-level similarity heatmapping. By generating embeddings for each paragraph of both documents separately and computing pairwise similarities between all paragraph combinations, the system could highlight specific sections of Document 2 that are semantically similar to corresponding sections of Document 1. This paragraph-level attribution would transform DocSimilarity from a document-level verdict tool into a granular analytical instrument. A complementary near-term enhancement would be the implementation of simplified status message modes in the processing audit log, addressing the user acceptance testing feedback that some technical terminology was unfamiliar to non-specialist users."),
    blk(),
    bp("Medium-Term (3 to 6 months): The most significant medium-term enhancement is the integration of a vector database such as Pinecone, Weaviate, or the locally deployable Qdrant. A vector database would enable one-to-many semantic search: the embedding of a new submission could be compared against the embeddings of all previously submitted documents stored in the vector database in a single query operation, with results ranked by similarity score. This capability would transform DocSimilarity into an institutional screening platform capable of checking each new submission against an entire semester's accumulated submissions simultaneously."),
    blk(),
    bp("A complementary medium-term enhancement is the addition of multilingual support through the integration of a multilingual sentence embedding model such as mUSE (Multilingual Universal Sentence Encoder) or LaBSE (Language-agnostic BERT Sentence Embedding). These models produce semantically comparable embeddings for text in over 100 languages, enabling cross-language comparison — detecting, for instance, whether an English document has been translated into Hindi and submitted as original work — and also enabling proper semantic analysis of submissions in regional Indian languages."),
    blk(),
    bp("Long-Term (6 to 12 months): The most transformative long-term enhancement is the development of a REST API layer that exposes the DocSimilarity comparison pipeline to external systems. This API would enable direct integration with Learning Management Systems (LMS) such as Moodle, Google Classroom, and Canvas, allowing semantic similarity analysis to be triggered automatically as part of the assignment submission workflow. Instructors would receive similarity scores directly within their grading interface, with a link to the full DocSimilarity report, without requiring manual document upload to the comparison tool. A complementary long-term enhancement is the development of native mobile applications for iOS and Android using React Native, enabling on-device comparison of documents captured through the device camera, with OCR processing performed locally on the mobile device."),

    // ═══════════════════════════════════════════════════════════════
    // APPENDIX 1 — ALGORITHM
    // ═══════════════════════════════════════════════════════════════
    ...chTitle("APPENDIX 1: SYSTEM ALGORITHM"),

    sh("Complete Step-by-Step System Algorithm"),
    blk(),
    bp("The following algorithm describes the complete operational sequence of the DocSimilarity system from server initialization through response delivery. Each step corresponds to a distinct module or sub-process in the system architecture."),
    blk(),
    bp("Step 1 — Server Initialization:"),
    bul("FastAPI application instance is created and all route handlers are registered."),
    bul("MongoDB connection is established using the connection string from the environment configuration."),
    bul("The all-MiniLM-L6-v2 SentenceTransformer model is instantiated from the local model weights directory and loaded into host RAM. This step is executed once at startup."),
    bul("The FastAPI ASGI server begins accepting incoming HTTP connections on the configured port."),
    blk(),
    bp("Step 2 — Request Reception:"),
    bul("An HTTP POST request is received at the /api/compare endpoint."),
    bul("The request body is parsed as Multipart/Form-Data."),
    bul("Two file objects (file1, file2) are extracted as in-memory byte streams."),
    bul("Request validation confirms that exactly two files have been submitted. If not, a 422 Unprocessable Entity response is returned with a descriptive error message."),
    blk(),
    bp("Step 3 — MIME Type Detection and Routing (for each file independently):"),
    bul("The python-magic library inspects the leading bytes of the file's byte stream to determine its MIME type."),
    bul("If MIME type is application/pdf: the byte stream is passed to the PyPDF2 extraction module."),
    bul("If MIME type is application/vnd.openxmlformats-officedocument.wordprocessingml.document: the byte stream is passed to the python-docx extraction module."),
    bul("If MIME type is image/jpeg or image/png or image/tiff: the byte stream is passed to the OCR sub-pipeline."),
    bul("If MIME type is text/plain: the byte stream is decoded directly to a UTF-8 string."),
    bul("If MIME type is unrecognized: a 400 Bad Request response is returned identifying the unsupported format."),
    blk(),
    bp("Step 4 — Format-Specific Text Extraction:"),
    bul("PDF: PyPDF2 PdfReader object is instantiated from the byte stream. Pages are iterated. Text is extracted from each page object and concatenated."),
    bul("DOCX: python-docx Document object is instantiated from the byte stream. Paragraph elements are iterated. Text content of each paragraph is concatenated."),
    bul("Image (OCR): Byte stream is decoded to a PIL Image object. Grayscale conversion is applied. Adaptive thresholding is applied with block size 11 and constant 2. Preprocessed image is passed to pytesseract.image_to_string() with the Tesseract LSTM engine configuration. Raw OCR output string is returned."),
    bul("Plain text: Byte stream is decoded to string using UTF-8 encoding with error replacement."),
    blk(),
    bp("Step 5 — Text Normalization (applied to both extracted strings):"),
    bul("Unicode normalization to NFC form using unicodedata.normalize()."),
    bul("Lowercase conversion using str.lower()."),
    bul("Removal of non-printable characters using a compiled regular expression matching Unicode control character ranges."),
    bul("Replacement of multiple consecutive whitespace characters (spaces, tabs, newlines) with a single space."),
    bul("Stripping of leading and trailing whitespace."),
    bul("Word count of the normalized string is recorded for metadata persistence."),
    blk(),
    bp("Step 6 — Embedding Generation:"),
    bul("SentenceTransformer.encode() is called with both normalized strings as a list of two inputs."),
    bul("The model applies WordPiece tokenization, truncating to 512 tokens if necessary."),
    bul("The token sequence is processed through 6 Transformer encoder layers with multi-head self-attention."),
    bul("Mean pooling is applied over the final encoder layer's token representations."),
    bul("L2-normalization is applied to the pooled vector to produce a unit-length 384-dimensional float32 embedding for each input."),
    bul("Two embedding vectors (v1, v2) are returned."),
    blk(),
    bp("Step 7 — Similarity Computation:"),
    bul("Cosine similarity is computed as the dot product of v1 and v2 (equivalent to cosine angle since both vectors are unit length)."),
    bul("The raw similarity value (range 0.0 to 1.0) is multiplied by 100.0."),
    bul("The result is rounded to two decimal places to produce the final percentage score S."),
    blk(),
    bp("Step 8 — Persistence:"),
    bul("An Analysis document is constructed containing: filenames, file types, word counts, similarity score S, processing duration in milliseconds, and UTC timestamp."),
    bul("The document is inserted into the MongoDB Analysis collection using an async database client."),
    bul("The inserted document's ObjectId is recorded for inclusion in the response."),
    blk(),
    bp("Step 9 — Response:"),
    bul("A JSON response object is constructed containing the similarity score, analysis metadata, and the MongoDB document ID."),
    bul("The response is returned to the React frontend with HTTP status 200 OK."),
    bul("The frontend receives the response, triggers the SimilarityGauge animation to score S, and renders the comparison summary panel."),

    // ═══════════════════════════════════════════════════════════════
    // APPENDIX 2 — PROJECT MAPPING
    // ═══════════════════════════════════════════════════════════════
    ...chTitle("APPENDIX 2: PROJECT MAPPING AND CATEGORIZATION"),

    sh("1. Project Title Mapping with Programme Outcomes and PSOs"),
    blk(),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 120, line: LS }, children: [new TextRun({ text: "Table A2.1: Project Mapping with Programme Outcomes (POs) and Department Specific Outcomes (DSOs)", font: FONT, size: SZ, bold: true })] }),
    new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: [3000, 2752, 2752],
      rows: [
        tRow(["Project Title", "Programme Outcomes (POs)", "Department Specific Outcomes (DSOs)"], [3000, 2752, 2752], true),
        tRow(["DocSimilarity: AI-Powered Document Semantic Analysis and Similarity Detection", "PO1, PO2, PO3, PO5, PO10, PO12", "PSO1, PSO2"], [3000, 2752, 2752]),
      ]
    }),
    blk(),
    bp("Explanation: The project directly applies foundational knowledge in Information Technology including programming, data structures, and software engineering (PO1) to the complex, multi-disciplinary real-world problem of semantic document verification (PO2). It requires the application of modern machine learning tools and web development frameworks including Sentence Transformers and FastAPI (PO5) and demonstrates professional responsibility in system design through the privacy-first, zero-cloud architecture (PO10). The experience of planning, developing, and evaluating a complete software system contributes to the students' capacity for self-directed lifelong learning in the rapidly evolving field of NLP and AI (PO12). The project specifically addresses the department's outcomes relating to the development of IT solutions for real-world problems (PSO1) and the application of data management and software design principles (PSO2)."),
    blk(),
    sh("2. Project Categorization"),
    blk(),
    bp("Category: Application-Based Development Project."),
    blk(),
    bp("This project is classified as an application-based development project because its primary deliverable is a fully functional, deployable software application that solves a concrete real-world problem. The contribution of the project lies in the design, implementation, integration, and empirical validation of this application, rather than in the development of a new algorithm or theoretical framework. The core algorithmic components — the Sentence-Transformer model, the Cosine Similarity metric, the OCR pipeline — are established techniques; the contribution is their systematic integration into a locally deployable, privacy-preserving, multi-modal semantic document comparison platform."),
    blk(),
    sh("3. Mapping with Sustainable Development Goals"),
    blk(),
    bp("SDG 4 — Quality Education: DocSimilarity strengthens academic integrity by equipping educational institutions with a technically robust instrument for detecting AI-assisted semantic plagiarism. As AI paraphrasing tools become increasingly sophisticated and accessible to students, maintaining the meaning and value of academic assessment requires detection tools that evaluate conceptual content rather than surface vocabulary. By providing such a tool — and making it available without subscription costs through local deployment — this project contributes materially to the quality and fairness of educational evaluation."),
    blk(),
    bp("SDG 9 — Industry, Innovation, and Infrastructure: The project demonstrates that state-of-the-art AI analytical capabilities can be embedded within institutional infrastructure using locally deployable, open-source components, without dependency on commercial cloud platforms. This architectural approach reduces the cost of access to high-quality document analysis for organizations with limited technology budgets, contributes to the development of locally maintainable AI infrastructure, and provides a replicable blueprint for Privacy-First machine learning applications in any domain where data sovereignty is a priority."),

    // ═══════════════════════════════════════════════════════════════
    // APPENDIX 3 — SIMILARITY CHECK CERTIFICATE
    // ═══════════════════════════════════════════════════════════════
    ...chTitle("APPENDIX 3: SIMILARITY CHECK CERTIFICATE"),
    blk(), blk(),
    bp("I have examined the soft copy of the Project Report submitted by Saloni Devi (2823681), Vansh Salgotra (2823679), Ajay Singh (2823682), and Himanshi Verma (2823680) on the topic:"),
    blk(),
    ctrB("\"DocSimilarity: AI-Powered Document Semantic Analysis and Similarity Detection\""),
    blk(), blk(),
    bp("The report in PDF format, consisting of _____________ number of pages and _____________ number of words, has been verified using Turnitin on _________________ (Date), which reflects an overall Similarity Index of _____________ percentage."),
    blk(),
    bp("The similarity index is within the permissible limit of 20% as prescribed by Panipat Institute of Engineering and Technology. This certificate is issued on the basis of the originality check conducted on the submitted document."),
    blk(), blk(), blk(),
    bp("________________________"),
    bp("Signature of Supervisor"),
    bp("Name: Mr. Sourabh Gupta"),
    bp("Designation: Assistant Professor"),
    bp("Department of Information Technology"),
    bp("Panipat Institute of Engineering and Technology"),
    bp("Dated: _______________"),

    // ═══════════════════════════════════════════════════════════════
    // REFERENCES
    // ═══════════════════════════════════════════════════════════════
    ...chTitle("REFERENCES"),
    bp("[1]  N. Reimers and I. Gurevych, \"Sentence-BERT: Sentence Embeddings using Siamese BERT-Networks,\" in Proceedings of the 2019 Conference on Empirical Methods in Natural Language Processing (EMNLP), Hong Kong, China, Nov. 2019, pp. 3982–3992."),
    blk(),
    bp("[2]  A. Vaswani, N. Shazeer, N. Parmar, J. Uszkoreit, L. Jones, A. N. Gomez, L. Kaiser, and I. Polosukhin, \"Attention Is All You Need,\" in Advances in Neural Information Processing Systems (NeurIPS), vol. 30, Dec. 2017."),
    blk(),
    bp("[3]  J. Devlin, M. W. Chang, K. Lee, and K. Toutanova, \"BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding,\" in Proceedings of NAACL-HLT 2019, Minneapolis, USA, Jun. 2019, pp. 4171–4186."),
    blk(),
    bp("[4]  T. Mikolov, K. Chen, G. Corrado, and J. Dean, \"Efficient Estimation of Word Representations in Vector Space,\" in Proceedings of the International Conference on Learning Representations (ICLR), Scottsdale, AZ, USA, May 2013."),
    blk(),
    bp("[5]  J. Pennington, R. Socher, and C. D. Manning, \"GloVe: Global Vectors for Word Representation,\" in Proceedings of the 2014 Conference on Empirical Methods in Natural Language Processing (EMNLP), Doha, Qatar, Oct. 2014, pp. 1532–1543."),
    blk(),
    bp("[6]  R. Smith, \"An Overview of the Tesseract OCR Engine,\" in Proceedings of the Ninth International Conference on Document Analysis and Recognition (ICDAR), Curitiba, Brazil, Sep. 2007, pp. 629–633."),
    blk(),
    bp("[7]  W. Wang, F. Wei, L. Dong, H. Bao, N. Yang, and M. Zhou, \"MiniLM: Deep Self-Attention Distillation for Task-Agnostic Compression of Pre-Trained Transformers,\" in Advances in Neural Information Processing Systems (NeurIPS), vol. 33, Dec. 2020, pp. 5776–5788."),
    blk(),
    bp("[8]  P. Jaccard, \"Etude comparative de la distribution florale dans une portion des Alpes et des Jura,\" Bulletin de la Société Vaudoise des Sciences Naturelles, vol. 37, pp. 547–579, 1901."),
    blk(),
    bp("[9]  G. Salton and C. Buckley, \"Term-weighting approaches in automatic text retrieval,\" Information Processing and Management, vol. 24, no. 5, pp. 513–523, 1988."),
    blk(),
    bp("[10] FastAPI Documentation (2024). Tiangolo — FastAPI Framework for building APIs with Python. [Online]. Available: https://fastapi.tiangolo.com [Accessed: Apr. 2025]."),
    blk(),
    bp("[11] React.js Documentation (2024). React — The Library for Web and Native User Interfaces. [Online]. Available: https://react.dev [Accessed: Apr. 2025]."),
    blk(),
    bp("[12] MongoDB Manual (2024). MongoDB, Inc. [Online]. Available: https://docs.mongodb.com [Accessed: Apr. 2025]."),
    blk(),
    bp("[13] Hugging Face (2024). all-MiniLM-L6-v2 Model Card. [Online]. Available: https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2 [Accessed: Apr. 2025]."),
    blk(),
    bp("[14] Tesseract OCR Documentation (2024). Tesseract Open Source OCR Engine. [Online]. Available: https://github.com/tesseract-ocr/tesseract [Accessed: Apr. 2025]."),
    blk(),
    bp("[15] PyTorch Documentation (2024). PyTorch: An Open Source Machine Learning Framework. [Online]. Available: https://pytorch.org/docs [Accessed: Apr. 2025]."),

    ] // end chapter children
  }  // end section 3
  ]  // end sections
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync('/home/claude/DocSimilarity_FINAL_47pages.docx', buf);
  console.log('Done');
});