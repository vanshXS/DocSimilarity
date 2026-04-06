import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getHighlights } from "../api/analysisApi";
import {
  ArrowLeft,
  FileText,
  Loader2,
  AlertTriangle,
  CheckCircle,
  Info,
} from "lucide-react";

export default function DetailedComparison() {
  const location = useLocation();
  const navigate = useNavigate();

  const { fileA, fileB, overallScore, sessionId } = location.state || {};

  const [highlights, setHighlights] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!fileA || !fileB || !sessionId) {
      navigate("/");
      return;
    }
    loadHighlights();
  }, []);

  const loadHighlights = async () => {
    try {
      const data = await getHighlights(sessionId, fileA.file_id, fileB.file_id);
      const sorted = (data.highlights || []).sort(
        (a, b) => b.similarity - a.similarity
      );
      setHighlights(sorted);
    } catch (err) {
      console.error("Failed to load highlights:", err);
    } finally {
      setLoading(false);
    }
  };

  // FIX BUG-5: Tailwind cannot resolve dynamic class names like `text-${color}-700`.
  // All class names must be static strings so Tailwind includes them in the build.
  const getRiskStyle = (score) => {
    if (score >= 70) return {
      label: "HIGH RISK",
      wrapperClass: "bg-red-50 border-red-200",
      scoreClass: "text-red-700",
      labelClass: "text-red-600",
    };
    if (score >= 40) return {
      label: "MODERATE",
      wrapperClass: "bg-orange-50 border-orange-200",
      scoreClass: "text-orange-700",
      labelClass: "text-orange-600",
    };
    return {
      label: "LOW RISK",
      wrapperClass: "bg-green-50 border-green-200",
      scoreClass: "text-green-700",
      labelClass: "text-green-600",
    };
  };

  const risk = getRiskStyle(overallScore);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Back Button */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Results
      </button>

      {/* Header Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">
            Detailed Comparison Report
          </h1>

          {/* FIX BUG-5: Static class names via lookup object */}
          <div className={`px-4 py-2 rounded-lg border-2 ${risk.wrapperClass} text-center`}>
            <p className={`text-3xl font-bold ${risk.scoreClass}`}>
              {overallScore}%
            </p>
            <p className={`text-xs font-semibold ${risk.labelClass}`}>
              {risk.label}
            </p>
          </div>
        </div>

        {/* Document Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-lg">
            <FileText className="w-6 h-6 text-blue-600 mt-1" />
            <div>
              <p className="text-sm font-semibold text-gray-600 mb-1">Document A</p>
              <p className="font-medium text-gray-900">{fileA?.filename}</p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-4 bg-purple-50 rounded-lg">
            <FileText className="w-6 h-6 text-purple-600 mt-1" />
            <div>
              <p className="text-sm font-semibold text-gray-600 mb-1">Document B</p>
              <p className="font-medium text-gray-900">{fileB?.filename}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
        <div>
          <p className="font-medium text-blue-900">Semantic Similarity Detection</p>
          <p className="text-sm text-blue-800 mt-1">
            The system identified{" "}
            <span className="font-bold">{highlights.length}</span> similar sentence
            {highlights.length !== 1 ? "s" : ""} between these documents using
            AI-powered semantic analysis. Matches are shown side-by-side below.
          </p>
        </div>
      </div>

      {/* Highlights */}
      {highlights.length === 0 ? (
        <div className="text-center p-12 bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="bg-green-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h3 className="text-lg font-medium text-gray-900">
            No Specific Sentence Matches Found
          </h3>
          <p className="text-gray-600 mt-2">
            While the overall similarity is {overallScore}%, no individual
            sentence-level matches exceeded the detection threshold.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Similar Sentences ({highlights.length})
            </h2>
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 bg-blue-200 rounded border border-blue-300"></div>
                <span>Document A</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 bg-purple-200 rounded border border-purple-300"></div>
                <span>Document B</span>
              </div>
            </div>
          </div>

          {highlights.map((highlight, index) => (
            <HighlightCard
              key={highlight.highlight_id || index}
              index={index + 1}
              highlight={highlight}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function HighlightCard({ index, highlight }) {
  // FIX BUG-5: Static class names only — no dynamic template strings
  const getSimilarityStyle = (score) => {
    if (score >= 90) return "text-red-700 bg-red-100 border border-red-200";
    if (score >= 80) return "text-orange-700 bg-orange-100 border border-orange-200";
    return "text-yellow-700 bg-yellow-100 border border-yellow-200";
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-8 h-8 bg-gray-100 rounded-full text-sm font-bold text-gray-700">
            {index}
          </span>
          <span
            className={`px-3 py-1 rounded-full text-xs font-semibold ${getSimilarityStyle(
              highlight.similarity
            )}`}
          >
            {highlight.similarity.toFixed(1)}% Semantic Match
          </span>
        </div>
        {highlight.similarity >= 90 && (
          <div className="flex items-center gap-1 text-red-600">
            <AlertTriangle className="w-5 h-5" />
            <span className="text-xs font-semibold">Very High Match</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Sentence A */}
        <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
          <p className="text-xs font-semibold text-blue-700 mb-2 uppercase tracking-wide">
            From Document A
          </p>
          <p className="text-sm text-gray-800 leading-relaxed">
            {highlight.sentence_a}
          </p>
        </div>

        {/* Sentence B */}
        <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
          <p className="text-xs font-semibold text-purple-700 mb-2 uppercase tracking-wide">
            From Document B
          </p>
          <p className="text-sm text-gray-800 leading-relaxed">
            {highlight.sentence_b}
          </p>
        </div>
      </div>
    </div>
  );
}