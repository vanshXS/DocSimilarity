import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, FileText, Loader2, AlertCircle, BookOpen, ChevronLeft, ChevronRight } from "lucide-react";
import { getResults, resolveApiUrl } from "../api/analysisApi";

function buildPairKey(docA, docB) {
  return `${docA}::${docB}`;
}

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

    if (!sessionId || !decodedPairId) {
      navigate("/");
      return;
    }

    getResults(sessionId)
      .then((data) => {
        const matched = (data.pairs || []).find(
          (item) => buildPairKey(item.docA, item.docB) === decodedPairId
        );
        if (!matched) {
          navigate(`/session/${sessionId}`);
          return;
        }
        setPair(matched);
      })
      .catch(() => {
        setError("Failed to load comparison details.");
      })
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
   MAIN COMPARISON VIEW — master-detail layout
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
      {/* ─── Top bar ─── */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          onClick={() => navigate(`/session/${sessionId}`)}
          className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-indigo-600 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Results
        </button>

        <div className="flex items-center gap-4">
          {/* Doc names */}
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
          {/* Overall score */}
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-4 py-2 shadow-sm">
            <span className={`text-2xl font-black ${getScoreColor(pair.score)}`}>
              {pair.score}%
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Overall
            </span>
          </div>
        </div>
      </div>

      {/* ─── Main content ─── */}
      {pageMatches.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
          <BookOpen className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="font-semibold text-slate-600">No page-level matches found</p>
          <p className="mt-1 text-sm text-slate-400">
            The overall score is based on document-wide content similarity.
          </p>
        </div>
      ) : (
        <div className="flex gap-4" style={{ minHeight: "70vh" }}>
          {/* ─── Left: Page pair list (compact sidebar) ─── */}
          <div className="w-56 shrink-0 hidden lg:block">
            <div className="sticky top-4 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
                <p className="text-xs font-bold text-slate-600">
                  Page Matches
                  <span className="ml-2 text-slate-400 font-normal">
                    {pageMatches.length}
                  </span>
                </p>
              </div>
              <div className="max-h-[65vh] overflow-y-auto">
                {pageMatches.map((match, index) => (
                  <PagePairItem
                    key={`${match.pageA}-${match.pageB}`}
                    match={match}
                    index={index}
                    isActive={index === selectedIndex}
                    onClick={() => setSelectedIndex(index)}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* ─── Right: Selected pair detail ─── */}
          <div className="flex-1 min-w-0">
            {/* Mobile page selector (shown only on small screens) */}
            <div className="lg:hidden mb-4">
              <MobilePageSelector
                matches={pageMatches}
                selectedIndex={selectedIndex}
                onSelect={setSelectedIndex}
              />
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


/* ────────────────────────────────────────────────────────────────────────────
   LEFT SIDEBAR — compact page pair item
   ──────────────────────────────────────────────────────────────────────────── */

function PagePairItem({ match, index, isActive, onClick }) {
  const scoreColor = match.similarity >= 70
    ? "text-rose-600"
    : match.similarity >= 40
    ? "text-amber-600"
    : "text-emerald-600";

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 border-b border-slate-50 transition-all ${
        isActive
          ? "bg-indigo-50 border-l-2 border-l-indigo-500"
          : "hover:bg-slate-50 border-l-2 border-l-transparent"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`text-xs font-bold ${isActive ? "text-indigo-900" : "text-slate-700"}`}>
            P{match.pageA} vs P{match.pageB}
          </span>
        </div>
        <span className={`text-xs font-black ${scoreColor}`}>
          {match.similarity}%
        </span>
      </div>
    </button>
  );
}


/* ────────────────────────────────────────────────────────────────────────────
   MOBILE PAGE SELECTOR — horizontal scroll on small screens
   ──────────────────────────────────────────────────────────────────────────── */

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
              isActive
                ? "bg-indigo-50 border-indigo-300 text-indigo-700 shadow-sm"
                : `${scoreColor} text-slate-600 hover:shadow-sm`
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
   SELECTED PAIR VIEW — images + matched text for the active pair
   ──────────────────────────────────────────────────────────────────────────── */

function SelectedPairView({ match, docA, docB, index, total, onPrev, onNext }) {
  const previewRef = useRef(null);
  const [activeSectionIndex, setActiveSectionIndex] = useState(0);
  const matchedSections = Array.isArray(match.matched_lines) ? match.matched_lines : [];
  const activeSection = matchedSections[activeSectionIndex] || null;

  // Reset active section when page pair changes
  useEffect(() => {
    setActiveSectionIndex(0);
  }, [match.pageA, match.pageB]);

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
      {/* Header with nav arrows */}
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <button
              onClick={onPrev}
              disabled={index === 0}
              className="p-1 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs font-bold text-slate-500 min-w-[50px] text-center">
              {index + 1} / {total}
            </span>
            <button
              onClick={onNext}
              disabled={index === total - 1}
              className="p-1 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <h2 className="font-bold text-slate-800 text-sm">
            Page {match.pageA} <span className="text-slate-400 font-normal">vs</span> Page {match.pageB}
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <span className={`rounded-full border px-3 py-1 text-sm font-black ${scoreColor}`}>
            {match.similarity}%
          </span>
        </div>
      </div>

      <div className="p-5">
        {/* Image previews */}
        <div ref={previewRef} className="grid gap-4 md:grid-cols-2 mb-5">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-indigo-500 mb-1.5">
              {docA} — Page {match.pageA}
            </p>
            <PreviewImage
              src={match.imageA}
              alt={`${docA} page ${match.pageA}`}
              allSections={matchedSections}
              activeSectionIndex={activeSectionIndex}
              accentColor="indigo"
              side="A"
              onSectionClick={handleSectionClick}
            />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-amber-500 mb-1.5">
              {docB} — Page {match.pageB}
            </p>
            <PreviewImage
              src={match.imageB}
              alt={`${docB} page ${match.pageB}`}
              allSections={matchedSections}
              activeSectionIndex={activeSectionIndex}
              accentColor="amber"
              side="B"
              onSectionClick={handleSectionClick}
            />
          </div>
        </div>

        {/* Matched text sections */}
        {matchedSections.length > 0 && (
          <div>
            <h3 className="mb-2 text-xs font-bold text-slate-700">
              Similar Sections
              <span className="ml-2 text-[10px] font-normal text-slate-400">
                Click to highlight on image
              </span>
            </h3>
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {matchedSections.map((section, sIdx) => (
                <MatchedSection
                  key={sIdx}
                  section={section}
                  index={sIdx}
                  isActive={sIdx === activeSectionIndex}
                  onClick={() => handleSectionClick(sIdx)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


/* ────────────────────────────────────────────────────────────────────────────
   MATCHED SECTION — compact text comparison
   ──────────────────────────────────────────────────────────────────────────── */

function MatchedSection({ section, index, isActive, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-lg p-3 text-left transition-all border ${
        isActive
          ? "border-indigo-200 bg-indigo-50 shadow-sm"
          : "border-slate-100 bg-slate-50 hover:border-slate-200"
      }`}
    >
      <div className="flex items-start gap-2.5">
        <span className={`mt-0.5 shrink-0 flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-black ${
          isActive ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-600"
        }`}>
          {index + 1}
        </span>
        <div className="space-y-2 flex-1 min-w-0">
          <div>
            <p className="mb-0.5 text-[9px] font-black uppercase tracking-wider text-indigo-500">Doc A</p>
            <p className="text-xs text-slate-700 leading-relaxed line-clamp-2">{section.textA}</p>
          </div>
          <div className="border-t border-slate-200 pt-2">
            <p className="mb-0.5 text-[9px] font-black uppercase tracking-wider text-amber-500">Doc B</p>
            <p className="text-xs text-slate-700 leading-relaxed line-clamp-2">{section.textB}</p>
          </div>
        </div>
      </div>
    </button>
  );
}


/* ────────────────────────────────────────────────────────────────────────────
   PREVIEW IMAGE + HIGHLIGHT OVERLAYS
   Shows ALL matched regions as coloured bands on the page image.
   Active section pulses; inactive ones are subtle semi-transparent bands.
   ──────────────────────────────────────────────────────────────────────────── */

function PreviewImage({ src, alt, allSections, activeSectionIndex, accentColor, side, onSectionClick }) {
  const resolvedSrc = resolveApiUrl(src);
  const borderColor = accentColor === "indigo" ? "border-indigo-200" : "border-amber-200";

  if (!resolvedSrc) {
    return (
      <div className="flex min-h-[180px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-xs text-slate-400">
        Preview not available
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden rounded-xl border-2 ${borderColor} bg-slate-50 group`}>
      <img
        src={resolvedSrc}
        alt={alt}
        className="block w-full h-auto"
        loading="lazy"
      />
      {/* Render highlight bands for ALL matched sections */}
      {allSections.map((section, idx) => {
        const region = side === "A" ? section.regionA : section.regionB;
        const pointer = side === "A" ? section.pointerA : section.pointerB;
        if (!region && !pointer) return null;

        return (
          <HighlightBand
            key={idx}
            index={idx}
            region={region}
            pointer={pointer}
            score={section.score}
            isActive={idx === activeSectionIndex}
            accentColor={accentColor}
            onClick={() => onSectionClick?.(idx)}
          />
        );
      })}
    </div>
  );
}


/* ── Single highlight band on a page image ── */

function HighlightBand({ index, region, pointer, score, isActive, accentColor, onClick }) {
  // Determine vertical position from region bounds, or fall back to pointer
  let topPct, heightPct;

  if (region) {
    topPct = Math.max(0, region.top * 100);
    heightPct = Math.max(1.5, (region.bottom - region.top) * 100);
  } else if (pointer?.y != null) {
    // No region data — use the pointer center with a small fixed height
    topPct = Math.max(0, pointer.y * 100 - 1.5);
    heightPct = 3;
  } else {
    return null;
  }

  // Color palette based on accent + active state
  const isIndigo = accentColor === "indigo";

  const activeGradient = isIndigo
    ? "linear-gradient(90deg, rgba(99,102,241,0.35) 0%, rgba(129,140,248,0.20) 50%, rgba(99,102,241,0.35) 100%)"
    : "linear-gradient(90deg, rgba(245,158,11,0.35) 0%, rgba(251,191,36,0.20) 50%, rgba(245,158,11,0.35) 100%)";

  const inactiveGradient = isIndigo
    ? "linear-gradient(90deg, rgba(99,102,241,0.12) 0%, rgba(129,140,248,0.08) 50%, rgba(99,102,241,0.12) 100%)"
    : "linear-gradient(90deg, rgba(245,158,11,0.12) 0%, rgba(251,191,36,0.08) 50%, rgba(245,158,11,0.12) 100%)";

  const activeBorder = isIndigo ? "rgba(99,102,241,0.7)" : "rgba(245,158,11,0.7)";
  const inactiveBorder = isIndigo ? "rgba(99,102,241,0.25)" : "rgba(245,158,11,0.25)";

  const badgeBg = isIndigo
    ? (isActive ? "#4f46e5" : "#a5b4fc")
    : (isActive ? "#d97706" : "#fcd34d");
  const badgeText = isActive ? "#ffffff" : (isIndigo ? "#312e81" : "#78350f");

  return (
    <div
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      className={`absolute left-0 right-0 z-10 cursor-pointer transition-all duration-300 ${
        isActive ? "highlight-band-active" : "hover:brightness-150"
      }`}
      style={{
        top: `${topPct}%`,
        height: `${heightPct}%`,
        minHeight: "6px",
        background: isActive ? activeGradient : inactiveGradient,
        borderTop: `2px solid ${isActive ? activeBorder : inactiveBorder}`,
        borderBottom: `2px solid ${isActive ? activeBorder : inactiveBorder}`,
        boxShadow: isActive
          ? `0 0 12px ${isIndigo ? "rgba(99,102,241,0.3)" : "rgba(245,158,11,0.3)"}`
          : "none",
      }}
    >
      {/* Badge with section number */}
      <div
        className="absolute flex items-center justify-center rounded-full shadow-md transition-all duration-300"
        style={{
          width: isActive ? "22px" : "18px",
          height: isActive ? "22px" : "18px",
          top: "50%",
          transform: "translateY(-50%)",
          right: "6px",
          backgroundColor: badgeBg,
          color: badgeText,
          fontSize: isActive ? "10px" : "9px",
          fontWeight: 800,
          border: isActive ? "2px solid rgba(255,255,255,0.9)" : "1.5px solid rgba(255,255,255,0.6)",
        }}
      >
        {index + 1}
      </div>

      {/* Left edge accent strip */}
      <div
        className="absolute left-0 top-0 bottom-0 transition-all duration-300"
        style={{
          width: isActive ? "4px" : "3px",
          backgroundColor: isActive ? activeBorder : inactiveBorder,
          borderRadius: "0 2px 2px 0",
        }}
      />
    </div>
  );
}