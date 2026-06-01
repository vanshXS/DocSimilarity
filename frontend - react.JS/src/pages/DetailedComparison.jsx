import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, FileText, Loader2, AlertCircle, BookOpen, ChevronLeft, ChevronRight, Eye, EyeOff, ZoomIn, MapPin, Info } from "lucide-react";
import { getResults, resolveApiUrl } from "../api/analysisApi";

function buildPairKey(docA, docB) {
  return `${docA}::${docB}`;
}

/* ────────────────────────────────────────────────────────────────────────────
   NOISE DETECTION — decide if OCR text is readable or garbage
   ──────────────────────────────────────────────────────────────────────────── */

const COMMON_WORDS = new Set([
  "the","a","an","is","are","was","were","be","been","being","have","has","had",
  "do","does","did","will","would","shall","should","may","might","can","could",
  "and","but","or","not","no","if","then","else","when","where","which","what",
  "who","how","this","that","these","those","it","its","in","on","at","to","for",
  "of","with","by","from","as","into","about","between","through","after","before",
  "above","below","up","down","out","off","over","under","again","further","once",
  "here","there","all","each","every","both","few","more","most","other","some",
  "such","only","own","same","so","than","too","very","also","just","because",
  "while","during","since","until","although","though","however","therefore",
  "system","data","file","process","command","linux","windows","user","output",
  "input","program","function","code","server","network","memory","disk","cpu",
]);

function isReadableText(text) {
  if (!text || text.length < 5) return false;
  const words = text.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter(w => w.length >= 2);
  if (words.length < 3) return false;
  const recognizedCount = words.filter(w => COMMON_WORDS.has(w) || w.length >= 6).length;
  const recognizedRatio = recognizedCount / words.length;
  const avgLen = words.reduce((sum, w) => sum + w.length, 0) / words.length;
  const alphaChars = (text.match(/[a-zA-Z]/g) || []).length;
  const totalChars = text.replace(/\s/g, "").length;
  const alphaRatio = totalChars > 0 ? alphaChars / totalChars : 0;
  let passes = 0;
  if (recognizedRatio >= 0.25) passes++;
  if (avgLen >= 3.0) passes++;
  if (alphaRatio >= 0.70) passes++;
  return passes >= 2;
}

function truncateText(text, maxLen = 120) {
  if (!text) return "";
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trim() + "…";
}


/* ────────────────────────────────────────────────────────────────────────────
   ROOT COMPONENT
   ──────────────────────────────────────────────────────────────────────────── */

export default function DetailedComparison() {
  const location = useLocation();
  const navigate = useNavigate();
  const { sessionId, pairId } = useParams();

  const initialPair = location.state?.pair || null;
  const [pair, setPair] = useState(initialPair);
  const [loading, setLoading] = useState(!initialPair);
  const [error, setError] = useState("");

  const decodedPairId = useMemo(() => {
    try { return decodeURIComponent(pairId || ""); }
    catch { return pairId || ""; }
  }, [pairId]);

  useEffect(() => {
    if (pair && buildPairKey(pair.docA, pair.docB) === decodedPairId) {
      setLoading(false);
      return;
    }
    if (!sessionId || !decodedPairId) { navigate("/"); return; }

    getResults(sessionId)
      .then((data) => {
        const matched = (data.pairs || []).find(
          (item) => buildPairKey(item.docA, item.docB) === decodedPairId
        );
        if (!matched) { navigate(`/session/${sessionId}`); return; }
        setPair(matched);
      })
      .catch(() => setError("Failed to load comparison details."))
      .finally(() => setLoading(false));
  }, [decodedPairId, navigate, pair, sessionId]);

  if (loading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-indigo-600" />
          <p className="text-slate-500 font-medium text-sm">Loading comparison...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-[60vh] items-center justify-center px-6">
        <div className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-700 max-w-md">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p className="font-medium">{error}</p>
        </div>
      </div>
    );
  }

  if (!pair) return null;
  return <ComparisonView pair={pair} sessionId={sessionId} navigate={navigate} />;
}


/* ────────────────────────────────────────────────────────────────────────────
   MAIN COMPARISON VIEW
   ──────────────────────────────────────────────────────────────────────────── */

function ComparisonView({ pair, sessionId, navigate }) {
  const pageMatches = pair.page_matches || [];
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectedMatch = pageMatches[selectedIndex] || null;

  const getScoreColor = (score) => {
    if (score >= 70) return "text-rose-600";
    if (score >= 40) return "text-amber-600";
    return "text-emerald-600";
  };

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6">
      {/* Top bar */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          onClick={() => navigate(`/session/${sessionId}`)}
          className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-indigo-600 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Results
        </button>

        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500">
            <span className="flex items-center gap-1.5 bg-indigo-50 text-indigo-700 px-2 py-1 rounded-lg font-semibold border border-indigo-100">
              <FileText className="h-3 w-3" />
              {pair.docA}
            </span>
            <span className="text-slate-300">vs</span>
            <span className="flex items-center gap-1.5 bg-amber-50 text-amber-700 px-2 py-1 rounded-lg font-semibold border border-amber-100">
              <FileText className="h-3 w-3" />
              {pair.docB}
            </span>
          </div>
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-4 py-2 shadow-sm">
            <span className={`text-2xl font-black ${getScoreColor(pair.score)}`}>
              {pair.score}%
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Overall</span>
          </div>
        </div>
      </div>

      {/* Main content */}
      {pageMatches.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
          <BookOpen className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <h3 className="font-bold text-slate-700 text-lg">No High-Risk Page Pairs Detected</h3>
          <p className="mt-2 text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
            The overall similarity score of <b>{pair.score}%</b> was derived from document-wide semantic embeddings and aggregate TF-IDF overlap. No specific page-to-page comparisons exceeded the required threshold for deep visual analysis.
          </p>
        </div>
      ) : (
        <div className="flex gap-4" style={{ minHeight: "70vh" }}>
          {/* Left sidebar */}
          <div className="w-56 shrink-0 hidden lg:block">
            <div className="sticky top-4 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
                <p className="text-xs font-bold text-slate-600">
                  Page Matches<span className="ml-2 text-slate-400 font-normal">{pageMatches.length}</span>
                </p>
              </div>
              <div className="max-h-[65vh] overflow-y-auto">
                {pageMatches.map((match, index) => (
                  <PagePairItem
                    key={`${match.pageA}-${match.pageB}`}
                    match={match}
                    isActive={index === selectedIndex}
                    onClick={() => setSelectedIndex(index)}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Right: detail */}
          <div className="flex-1 min-w-0">
            <div className="lg:hidden mb-4">
              <MobilePageSelector matches={pageMatches} selectedIndex={selectedIndex} onSelect={setSelectedIndex} />
            </div>
            {selectedMatch && (
              <SelectedPairView
                match={selectedMatch}
                docA={pair.docA}
                docB={pair.docB}
                index={selectedIndex}
                total={pageMatches.length}
                onPrev={() => setSelectedIndex(Math.max(0, selectedIndex - 1))}
                onNext={() => setSelectedIndex(Math.min(pageMatches.length - 1, selectedIndex + 1))}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}


/* ── Sidebar item ── */

function PagePairItem({ match, isActive, onClick }) {
  const scoreColor = match.similarity >= 70 ? "text-rose-600" : match.similarity >= 40 ? "text-amber-600" : "text-emerald-600";
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 border-b border-slate-50 transition-all ${
        isActive ? "bg-indigo-50 border-l-2 border-l-indigo-500" : "hover:bg-slate-50 border-l-2 border-l-transparent"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`text-xs font-bold ${isActive ? "text-indigo-900" : "text-slate-700"}`}>P{match.pageA} vs P{match.pageB}</span>
        <span className={`text-xs font-black ${scoreColor}`}>{match.similarity}%</span>
      </div>
    </button>
  );
}


/* ── Mobile page selector ── */

function MobilePageSelector({ matches, selectedIndex, onSelect }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
      {matches.map((match, index) => {
        const isActive = index === selectedIndex;
        const scoreColor = match.similarity >= 70 ? "border-rose-300 bg-rose-50" :
          match.similarity >= 40 ? "border-amber-300 bg-amber-50" : "border-emerald-300 bg-emerald-50";
        return (
          <button
            key={`${match.pageA}-${match.pageB}`}
            onClick={() => onSelect(index)}
            className={`shrink-0 px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
              isActive ? "bg-indigo-50 border-indigo-300 text-indigo-700 shadow-sm" : `${scoreColor} text-slate-600 hover:shadow-sm`
            }`}
          >
            P{match.pageA}↔P{match.pageB} · {match.similarity}%
          </button>
        );
      })}
    </div>
  );
}


/* ────────────────────────────────────────────────────────────────────────────
   SELECTED PAIR VIEW — images + highlights + cropped region comparison
   ──────────────────────────────────────────────────────────────────────────── */

function SelectedPairView({ match, docA, docB, index, total, onPrev, onNext }) {
  const previewRef = useRef(null);
  const [activeSectionIndex, setActiveSectionIndex] = useState(0);
  const [highlightsVisible, setHighlightsVisible] = useState(true);

  const matchedSections = useMemo(
    () => (Array.isArray(match.matched_lines) ? match.matched_lines : []),
    [match.matched_lines]
  );

  // Show top 5 most relevant matches
  const visibleSections = useMemo(() => {
    return matchedSections
      .map((s, i) => ({ ...s, _origIndex: i }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [matchedSections]);

  useEffect(() => { setActiveSectionIndex(0); }, [match.pageA, match.pageB]);

  const handleSectionClick = (sectionIndex) => {
    setActiveSectionIndex(sectionIndex);
    previewRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  const scoreColor = match.similarity >= 70
    ? "text-rose-600 bg-rose-50 border-rose-200"
    : match.similarity >= 40
    ? "text-amber-600 bg-amber-50 border-amber-200"
    : "text-emerald-600 bg-emerald-50 border-emerald-200";

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <button onClick={onPrev} disabled={index === 0}
              className="p-1 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-all">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs font-bold text-slate-500 min-w-[50px] text-center">{index + 1} / {total}</span>
            <button onClick={onNext} disabled={index === total - 1}
              className="p-1 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-all">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <h2 className="font-bold text-slate-800 text-sm">
            Page {match.pageA} <span className="text-slate-400 font-normal">vs</span> Page {match.pageB}
          </h2>
        </div>
        <div className="flex items-center gap-3">
          {visibleSections.length > 0 && (
            <button
              onClick={() => setHighlightsVisible((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                highlightsVisible
                  ? "bg-yellow-50 border-yellow-300 text-yellow-700 hover:bg-yellow-100"
                  : "bg-slate-50 border-slate-200 text-slate-400 hover:bg-slate-100"
              }`}
            >
              {highlightsVisible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              {highlightsVisible ? "Highlights On" : "Highlights Off"}
            </button>
          )}
          <span className={`rounded-full border px-3 py-1 text-sm font-black ${scoreColor}`}>
            {match.similarity}%
          </span>
        </div>
      </div>

      <div className="p-5">
        {/* Full page image previews with highlight boxes */}
        <div ref={previewRef} className="grid gap-4 md:grid-cols-2 mb-5">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-indigo-500 mb-1.5">
              {docA} — Page {match.pageA}
            </p>
            <PreviewImage
              src={match.imageA}
              alt={`${docA} page ${match.pageA}`}
              accentColor="indigo"
              highlights={visibleSections}
              highlightsVisible={highlightsVisible}
              activeIndex={activeSectionIndex}
              side="A"
              onHighlightClick={handleSectionClick}
            />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-amber-500 mb-1.5">
              {docB} — Page {match.pageB}
            </p>
            <PreviewImage
              src={match.imageB}
              alt={`${docB} page ${match.pageB}`}
              accentColor="amber"
              highlights={visibleSections}
              highlightsVisible={highlightsVisible}
              activeIndex={activeSectionIndex}
              side="B"
              onHighlightClick={handleSectionClick}
            />
          </div>
        </div>

        {/* Matched regions panel — cropped image comparison + optional text */}
        {visibleSections.length > 0 ? (
          <MatchedSectionsPanel
            sections={visibleSections}
            totalCount={matchedSections.length}
            activeIndex={activeSectionIndex}
            onSectionClick={handleSectionClick}
            docA={docA}
            docB={docB}
            imageA={match.imageA}
            imageB={match.imageB}
          />
        ) : (
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-6 flex items-start gap-4 shadow-sm mt-6">
            <Info className="h-6 w-6 text-indigo-500 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-indigo-900 text-sm">Semantic Match Detected</h3>
              <p className="text-sm text-slate-600 mt-1 leading-relaxed">
                The AI determined a <b>{match.similarity}%</b> overall similarity between these pages based on semantic concepts, vocabulary, and topic overlap.
              </p>
              <p className="text-sm text-slate-600 mt-2 leading-relaxed">
                However, no exact copied sub-regions were found. This typically occurs when documents share broad concepts but are phrased differently, or when handwritten content is too degraded for precise exact-match sub-region mapping.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


/* ────────────────────────────────────────────────────────────────────────────
   PREVIEW IMAGE WITH HIGHLIGHT BOUNDING BOXES
   ──────────────────────────────────────────────────────────────────────────── */

function PreviewImage({ src, alt, accentColor, highlights, highlightsVisible, activeIndex, side, onHighlightClick }) {
  const resolvedSrc = resolveApiUrl(src);
  const borderColor = accentColor === "indigo" ? "border-indigo-200" : "border-amber-200";

  if (!resolvedSrc) {
    return (
      <div className="flex min-h-[180px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-xs text-slate-400">
        Preview not available
      </div>
    );
  }

  const regionKey = side === "A" ? "regionA" : "regionB";

  return (
    <div className={`relative overflow-hidden rounded-xl border-2 ${borderColor} bg-slate-50 group`}>
      <img src={resolvedSrc} alt={alt} className="block w-full h-auto" loading="lazy" />

      {/* Highlight bounding boxes */}
      {highlightsVisible && highlights.map((section, sectionIndex) => {
        const region = section[regionKey];
        if (!region || region.top == null || region.bottom == null) return null;

        const topPercent = region.top * 100;
        const heightPercent = Math.max((region.bottom - region.top) * 100, 1.2);
        const isActive = sectionIndex === activeIndex;

        return (
          <button
            key={sectionIndex}
            onClick={(e) => { e.stopPropagation(); onHighlightClick(sectionIndex); }}
            className={`highlight-overlay-band ${isActive ? "highlight-band-active" : ""}`}
            style={{
              position: "absolute",
              top: `${topPercent}%`,
              height: `${heightPercent}%`,
              left: "2%",
              right: "2%",
              borderRadius: "6px",
              background: isActive
                ? "rgba(250, 204, 21, 0.25)"
                : "rgba(250, 204, 21, 0.10)",
              border: isActive
                ? "2px solid rgba(234, 179, 8, 0.9)"
                : "1px solid rgba(234, 179, 8, 0.5)",
              cursor: "pointer",
              transition: "all 0.25s ease",
              zIndex: isActive ? 20 : 10,
              boxShadow: isActive ? "0 0 12px rgba(234, 179, 8, 0.2)" : "none",
            }}
            title={`Match #${sectionIndex + 1} — ${Math.round(section.score * 100)}%`}
          >
            <span
              className={`absolute flex items-center justify-center rounded-full text-[9px] font-black leading-none select-none shadow-md ${
                isActive ? "bg-yellow-500 text-white" : "bg-yellow-400 text-yellow-900"
              }`}
              style={{ width: "20px", height: "20px", top: "50%", transform: "translateY(-50%)", left: "-10px" }}
            >
              {sectionIndex + 1}
            </span>
          </button>
        );
      })}
    </div>
  );
}


/* ────────────────────────────────────────────────────────────────────────────
   CROPPED REGION PREVIEW — zooms into the matched area of the page image
   ──────────────────────────────────────────────────────────────────────────── */

function CroppedRegion({ imageSrc, region, accentColor, label }) {
  const resolvedSrc = resolveApiUrl(imageSrc);
  const borderClass = accentColor === "indigo"
    ? "border-indigo-300 ring-indigo-100"
    : "border-amber-300 ring-amber-100";
  const labelColor = accentColor === "indigo" ? "text-indigo-500" : "text-amber-500";

  if (!resolvedSrc || !region || region.top == null || region.bottom == null) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-[10px] text-slate-400 h-24">
        Region unavailable
      </div>
    );
  }

  // Add 5% padding above and below the region for context, clamp to 0-1
  const padded_top = Math.max(0, region.top - 0.05);
  const padded_bottom = Math.min(1, region.bottom + 0.05);
  const regionHeight = padded_bottom - padded_top;

  // We'll use object-position + object-fit + overflow:hidden to "crop"
  // The image is scaled so the cropped region fills the container height
  // Scale factor: 1 / regionHeight  (e.g. if region is 20% of page, scale 5x)
  const scale = 1 / regionHeight;
  // The top offset: shift up so the region's top aligns with container top
  const translateY = -(padded_top * 100 * scale);

  return (
    <div className="min-w-0">
      <p className={`text-[9px] font-black uppercase tracking-wider ${labelColor} mb-1`}>
        {label}
      </p>
      <div
        className={`relative overflow-hidden rounded-lg border-2 ${borderClass} ring-2 bg-white`}
        style={{ height: "120px" }}
      >
        <img
          src={resolvedSrc}
          alt={`Cropped region from ${label}`}
          className="absolute left-0 w-full"
          style={{
            top: `${translateY}%`,
            height: `${scale * 100}%`,
            objectFit: "cover",
            objectPosition: "center top",
          }}
          loading="lazy"
        />
        {/* Yellow tint overlay on the cropped region */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "linear-gradient(180deg, rgba(250, 204, 21, 0.08) 0%, rgba(250, 204, 21, 0.12) 50%, rgba(250, 204, 21, 0.08) 100%)",
            borderRadius: "inherit",
          }}
        />
        {/* Zoom icon */}
        <div className="absolute top-1 right-1 bg-white/80 rounded p-0.5">
          <ZoomIn className="h-3 w-3 text-slate-400" />
        </div>
      </div>
    </div>
  );
}


/* ────────────────────────────────────────────────────────────────────────────
   MATCHED SECTIONS PANEL — cropped image regions + optional readable text
   ──────────────────────────────────────────────────────────────────────────── */

function MatchedSectionsPanel({ sections, totalCount, activeIndex, onSectionClick, docA, docB, imageA, imageB }) {
  const panelRef = useRef(null);
  const activeRef = useRef(null);

  useEffect(() => {
    if (activeRef.current && panelRef.current) {
      activeRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [activeIndex]);

  const getScoreStyle = (score) => {
    const pct = Math.round(score * 100);
    if (pct >= 70) return { color: "text-rose-600", bg: "bg-rose-50 border-rose-200" };
    if (pct >= 40) return { color: "text-amber-600", bg: "bg-amber-50 border-amber-200" };
    return { color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200" };
  };

  return (
    <div className="border border-slate-200 rounded-2xl overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center justify-between bg-slate-50 border-b border-slate-200 px-5 py-3">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm bg-yellow-400" />
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Similar Regions — Side by Side
          </h3>
          <span className="text-xs text-slate-400 font-medium">
            Top {sections.length} of {totalCount}
          </span>
        </div>
      </div>

      {/* Sections list */}
      <div ref={panelRef} className="max-h-[520px] overflow-y-auto divide-y divide-slate-100">
        {sections.map((section, sectionIndex) => {
          const isActive = sectionIndex === activeIndex;
          const style = getScoreStyle(section.score);
          const textAReadable = isReadableText(section.textA);
          const textBReadable = isReadableText(section.textB);
          const hasRegionA = section.regionA && section.regionA.top != null;
          const hasRegionB = section.regionB && section.regionB.top != null;

          return (
            <button
              key={sectionIndex}
              ref={isActive ? activeRef : undefined}
              onClick={() => onSectionClick(sectionIndex)}
              className={`w-full text-left px-5 py-4 transition-all ${
                isActive
                  ? "bg-yellow-50/60 border-l-[3px] border-l-yellow-500"
                  : "hover:bg-slate-50/80 border-l-[3px] border-l-transparent"
              }`}
            >
              {/* Header row */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-black ${
                      isActive ? "bg-yellow-500 text-white" : "bg-slate-200 text-slate-500"
                    }`}
                  >
                    {sectionIndex + 1}
                  </span>
                  <span className="text-xs font-semibold text-slate-600">
                    Region #{sectionIndex + 1}
                  </span>
                  {(!textAReadable || !textBReadable) && (
                    <span className="inline-flex items-center gap-0.5 text-[9px] font-medium text-slate-400 bg-slate-100 rounded px-1.5 py-0.5">
                      <MapPin className="h-2.5 w-2.5" />
                      Handwritten
                    </span>
                  )}
                </div>
                <span className={`rounded-full border px-2.5 py-0.5 text-xs font-black ${style.bg} ${style.color}`}>
                  {Math.round(section.score * 100)}%
                </span>
              </div>

              {/* ─── Cropped image regions side by side ─── */}
              {(hasRegionA || hasRegionB) && (
                <div className="grid grid-cols-2 gap-3 mb-2">
                  <CroppedRegion
                    imageSrc={imageA}
                    region={section.regionA}
                    accentColor="indigo"
                    label={docA}
                  />
                  <CroppedRegion
                    imageSrc={imageB}
                    region={section.regionB}
                    accentColor="amber"
                    label={docB}
                  />
                </div>
              )}

              {/* ─── Text preview (only if readable, otherwise a clean summary) ─── */}
              {textAReadable && textBReadable ? (
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <div className={`text-[11px] leading-relaxed rounded-lg p-2 border ${
                    isActive ? "bg-indigo-50/40 border-indigo-200" : "bg-slate-50/50 border-slate-100"
                  } text-slate-600`}>
                    <p className="line-clamp-2">{truncateText(section.textA, 120) || "—"}</p>
                  </div>
                  <div className={`text-[11px] leading-relaxed rounded-lg p-2 border ${
                    isActive ? "bg-amber-50/40 border-amber-200" : "bg-slate-50/50 border-slate-100"
                  } text-slate-600`}>
                    <p className="line-clamp-2">{truncateText(section.textB, 120) || "—"}</p>
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-slate-400 mt-1 italic">
                  Similar handwritten content detected in the regions shown above.
                </p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}