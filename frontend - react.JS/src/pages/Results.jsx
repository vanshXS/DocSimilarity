import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Calendar, FileText, Loader2, AlertCircle } from "lucide-react";
import { checkSessionStatus, getResults } from "../api/analysisApi";
import ProcessingAudit from "../components/ProcessingAudit";

function buildPairKey(docA, docB) {
  return `${docA}::${docB}`;
}

export default function Results() {
  const navigate = useNavigate();
  const { sessionId } = useParams();

  const [pairs, setPairs] = useState([]);
  const [sessionInfo, setSessionInfo] = useState({
    subject: "",
    title: "",
    date: "",
    status: "",
    current_step: "",
    progress_percent: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Use a ref for the polling interval so it survives re-renders
  // without being listed as a dependency (avoids infinite useEffect loops)
  const pollingRef = useRef(null);

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const loadData = async (id) => {
    try {
      const [info, data] = await Promise.all([
        checkSessionStatus(id),
        getResults(id),
      ]);

      setSessionInfo({
        subject: info.subject || "Document Similarity",
        title: info.title || "",
        date: new Date(info.created_at).toLocaleDateString(),
        status: info.status,
        current_step: info.current_step || "",
        progress_percent: info.progress_percent || 0,
      });

      const sortedPairs = [...(data.pairs || [])].sort((a, b) => b.score - a.score);
      setPairs(sortedPairs);

      // Stop polling once analysis is done
      if (info.status === "COMPLETED" || info.status === "FAILED") {
        stopPolling();
      }

      return info.status;
    } catch (err) {
      console.error("Failed to load results:", err);
      setError("Unable to load comparison results.");
      stopPolling();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!sessionId) {
      setError("Invalid Session ID.");
      setLoading(false);
      return;
    }

    // Initial load
    loadData(sessionId).then((status) => {
      // If still processing, start polling
      if (status === "PROCESSING") {
        pollingRef.current = setInterval(async () => {
          const currentStatus = await loadData(sessionId);
          if (currentStatus === "COMPLETED" || currentStatus === "FAILED") {
            stopPolling();
          }
        }, 3000);
      }
    });

    // Cleanup on unmount
    return () => stopPolling();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const handleViewDetails = (pair) => {
    const pairKey = buildPairKey(pair.docA, pair.docB);
    navigate(`/session/${sessionId}/comparison/${encodeURIComponent(pairKey)}`, {
      state: { pair, sessionId },
    });
  };

  const getScoreColor = (score) => {
    if (score >= 70) return "text-rose-600";
    if (score >= 40) return "text-amber-600";
    return "text-emerald-600";
  };

  const getScoreBg = (score) => {
    if (score >= 70) return "bg-rose-50 border-rose-200";
    if (score >= 40) return "bg-amber-50 border-amber-200";
    return "bg-emerald-50 border-emerald-200";
  };

  // Show audit screen while processing
  if (sessionInfo.status === "PROCESSING") {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center">
        <ProcessingAudit
          status={sessionInfo.status}
          currentStep={sessionInfo.current_step}
          progressPercent={sessionInfo.progress_percent}
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin text-indigo-600" />
          <p className="text-slate-500 font-medium">Loading results...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      {/* Back */}
      <button
        onClick={() => navigate("/")}
        className="mb-8 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-indigo-600 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Dashboard
      </button>

      {/* Session header */}
      <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{sessionInfo.subject}</h1>
            {sessionInfo.title && (
              <p className="mt-1 text-sm text-slate-500">{sessionInfo.title}</p>
            )}
            <div className="mt-3 flex items-center gap-4 text-sm text-slate-400">
              <span className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4" />
                {sessionInfo.date}
              </span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                sessionInfo.status === "COMPLETED"
                  ? "bg-emerald-100 text-emerald-700"
                  : sessionInfo.status === "FAILED"
                  ? "bg-rose-100 text-rose-700"
                  : "bg-blue-100 text-blue-700"
              }`}>
                {sessionInfo.status}
              </span>
            </div>
          </div>

          {pairs.length > 0 && (
            <div className="text-right shrink-0">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Pairs Analyzed</p>
              <p className="text-3xl font-black text-slate-900">{pairs.length}</p>
            </div>
          )}
        </div>
      </div>

      {/* Summary stats if we have results */}
      {pairs.length > 0 && (
        <div className="mb-6 grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-center">
            <p className="text-2xl font-black text-rose-600">
              {pairs.filter((p) => p.score >= 70).length}
            </p>
            <p className="text-xs font-bold text-rose-500 mt-1">High Risk (≥70%)</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center">
            <p className="text-2xl font-black text-amber-600">
              {pairs.filter((p) => p.score >= 40 && p.score < 70).length}
            </p>
            <p className="text-xs font-bold text-amber-500 mt-1">Medium Risk</p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
            <p className="text-2xl font-black text-emerald-600">
              {pairs.filter((p) => p.score < 40).length}
            </p>
            <p className="text-xs font-bold text-emerald-500 mt-1">Low Risk</p>
          </div>
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800">Document Pairs</h2>
        <p className="text-sm text-slate-400">{pairs.length} total • sorted by similarity</p>
      </div>

      {error ? (
        <div className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-700">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p className="font-medium">{error}</p>
        </div>
      ) : pairs.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
          <FileText className="mx-auto mb-4 h-12 w-12 text-slate-300" />
          <p className="font-semibold text-slate-600">No document pairs found</p>
          <p className="mt-1 text-sm text-slate-400">
            Make sure at least 2 files were uploaded and processed successfully.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {pairs.map((pair) => (
            <button
              key={buildPairKey(pair.docA, pair.docB)}
              onClick={() => handleViewDetails(pair)}
              className="w-full rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-all hover:border-indigo-200 hover:shadow-md active:scale-[0.99]"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="shrink-0 rounded-lg bg-slate-100 p-2">
                    <FileText className="h-4 w-4 text-slate-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">
                      {pair.docA}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">vs  {pair.docB}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className={`rounded-xl border px-4 py-2 text-center ${getScoreBg(pair.score)}`}>
                    <p className={`text-xl font-black ${getScoreColor(pair.score)}`}>
                      {pair.score}%
                    </p>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      similarity
                    </p>
                  </div>
                  <span className="text-xs font-bold text-indigo-500 hidden sm:block">
                    View →
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}